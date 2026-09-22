// What the owner sees when they ask "is everything all right?".
//
// The health page shows only what is wrong. `problems` is empty when nothing
// is, and the page says so in one line. Each problem is a sentence somebody
// who does not read code can act on — what happened, and what it means for
// them — never a function name or a stack trace.
import { readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { OpsStatus, Problem } from '../../shared/schemas.ts';
import { config } from './config.ts';
import { db, handle, query } from './db/index.ts';
import { schemaVersion } from './db/migrate.ts';
import { jobs, notifications, schedules } from './db/schema.ts';
import { workerHeartbeat } from './jobs/worker.ts';
import { recentErrors } from './log.ts';

export const startedAt = new Date();

const HOUR_MS = 3_600_000;
const BACKUP_STALE_MS = 36 * HOUR_MS;
const SCHEDULE_LATE_MS = 2 * HOUR_MS;
const WORKER_STALE_MS = 5 * 60_000;
const LOW_DISK_RATIO = 0.1;

async function diskSpace(): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const fs = await statfs(config.dataDir);
    const totalBytes = Number(fs.blocks) * Number(fs.bsize);
    // `bavail`, not `bfree`: the reserve is space this app cannot write to.
    const freeBytes = Number(fs.bavail) * Number(fs.bsize);
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    return { freeBytes, totalBytes };
  } catch {
    return null;
  }
}

async function newestBackup(): Promise<Date | null> {
  if (!config.backupDir) return null;
  try {
    let newest: Date | null = null;
    for (const name of await readdir(config.backupDir)) {
      const info = await stat(path.join(config.backupDir, name)).catch(() => null);
      if (!info?.isFile()) continue;
      if (!newest || info.mtime > newest) newest = info.mtime;
    }
    return newest;
  } catch {
    return null;
  }
}

async function databaseState(): Promise<'ok' | 'degraded' | 'down'> {
  try {
    await db.execute(sql`select 1`);
    return 'ok';
  } catch {
    return 'down';
  }
}

// One row per job name: how much is waiting, how much is running, how much
// gave up today, and when it last worked.
//
// The timestamps are formatted to text in SQL rather than read back as dates,
// because a raw query returns a string from the PostgreSQL driver and a Date
// from PGlite. Asking the database for the shape we publish removes the
// difference instead of papering over it.
const AS_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

async function jobSummary(since24h: Date): Promise<OpsStatus['jobs']> {
  const totals = await query<{
    name: string;
    queued: number;
    running: number;
    failed24h: number;
    last_succeeded_at: string | null;
    last_failed_at: string | null;
  }>(sql`
    select name,
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running,
      count(*) filter (where status = 'failed' and finished_at >= ${since24h})::int as failed24h,
      to_char(max(finished_at) filter (where status = 'done'), ${sql.raw(AS_ISO)}) as last_succeeded_at,
      to_char(max(finished_at) filter (where status = 'failed'), ${sql.raw(AS_ISO)}) as last_failed_at
    from ${jobs}
    group by name
    order by name
  `);

  const errors = await query<{ name: string; last_error: string | null }>(sql`
    select distinct on (name) name, last_error
    from ${jobs}
    where status = 'failed'
    order by name, finished_at desc nulls last
  `);
  const lastError = new Map(errors.map((row) => [row.name, row.last_error]));

  return totals.map((row) => ({
    name: row.name,
    queued: Number(row.queued),
    running: Number(row.running),
    failed24h: Number(row.failed24h),
    lastSucceededAt: row.last_succeeded_at,
    lastFailedAt: row.last_failed_at,
    lastError: lastError.get(row.name) ?? null,
  }));
}

export async function opsStatus(now: Date = new Date()): Promise<OpsStatus> {
  const since24h = new Date(now.getTime() - 24 * HOUR_MS);
  const problems: Problem[] = [];
  const database = await databaseState();

  const jobSummaries = database === 'down' ? [] : await jobSummary(since24h);

  for (const summary of jobSummaries) {
    if (summary.failed24h > 0) {
      problems.push({
        code: 'jobs_failed',
        severity: 'error',
        message: `Background work called "${summary.name}" failed ${summary.failed24h} time(s) in the last day and has given up. Whatever it does has not been done.`,
        since: summary.lastFailedAt,
        href: null,
      });
    }
  }

  if (database !== 'down') {
    const late = await db
      .select()
      .from(schedules)
      .where(sql`${schedules.nextRunAt} < ${new Date(now.getTime() - SCHEDULE_LATE_MS)}`);
    for (const row of late) {
      problems.push({
        code: 'schedule_missed',
        severity: 'warning',
        message: `The regular job "${row.name}" was due more than two hours ago and has not run. It usually means the app was restarted or the worker is turned off.`,
        since: row.nextRunAt.toISOString(),
        href: null,
      });
    }

    const [failedMail] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.status, 'failed'), gte(notifications.createdAt, since24h)));
    if (Number(failedMail?.count ?? 0) > 0) {
      problems.push({
        code: 'notifications_failed',
        severity: 'error',
        message: `${failedMail?.count} message(s) could not be sent in the last day. People who were meant to be told were not.`,
        since: null,
        href: null,
      });
    }
  } else {
    problems.push({
      code: 'database_down',
      severity: 'error',
      message: 'The app cannot reach its database. Nothing can be saved or read until it comes back.',
      since: null,
      href: null,
    });
  }

  const lastBackup = await newestBackup();
  if (config.backupDir && (!lastBackup || now.getTime() - lastBackup.getTime() > BACKUP_STALE_MS)) {
    problems.push({
      code: 'backup_stale',
      severity: 'error',
      message: lastBackup
        ? 'The last backup is more than a day and a half old. If the server were lost now, recent work would go with it.'
        : 'No backup has been made yet. If the server were lost now, everything would go with it.',
      since: lastBackup ? lastBackup.toISOString() : null,
      href: null,
    });
  }

  const disk = await diskSpace();
  if (disk && disk.freeBytes / disk.totalBytes < LOW_DISK_RATIO) {
    problems.push({
      code: 'disk_low',
      severity: 'warning',
      message: `Less than a tenth of the server's disk is free (${Math.round(disk.freeBytes / 1e9)} GB of ${Math.round(disk.totalBytes / 1e9)} GB). Uploads and backups will start failing.`,
      since: null,
      href: null,
    });
  }

  const beat = workerHeartbeat();
  if (config.worker && (!beat || now.getTime() - beat.getTime() > WORKER_STALE_MS)) {
    problems.push({
      code: 'worker_stale',
      severity: 'error',
      message: 'Background work has stopped running. Reminders and anything else that happens on its own will not happen.',
      since: beat ? beat.toISOString() : null,
      href: null,
    });
  }

  return {
    release: config.release,
    startedAt: startedAt.toISOString(),
    schemaVersion: database === 'down' ? 0 : await schemaVersion(db).catch(() => 0),
    database,
    problems,
    jobs: jobSummaries,
    recentErrors: recentErrors(),
    disk,
    lastBackupAt: lastBackup ? lastBackup.toISOString() : null,
  };
}

/** For `/health/ready`: is this process able to serve? */
export async function isReady(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export const databaseKind = handle.kind;

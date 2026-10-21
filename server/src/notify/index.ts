// One way to tell somebody something, and an outbox underneath it.
//
// Every message is written down before it is sent, so "did they ever get
// told?" has an answer even when sending failed. It is sent at once, so a
// sign-in link does not wait for the worker; when sending fails, the row keeps
// the address and the text and the worker tries again with a doubling wait,
// five times, before the health page counts it as a message nobody got.
//
// A message may carry a key — "health:backup_stale" — and is then sent once:
// while a sent or waiting row with that key is unresolved, another notify()
// with the same key is written down as skipped. resolveNotice(key) closes it,
// so the next occurrence of the same problem is told again.
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { db, type Db } from '../db/index.ts';
import { notifications, user } from '../db/schema.ts';
import { log } from '../log.ts';
import { emailChannel, type Channel } from './email.ts';

export type Notification = {
  /** Who to tell. Give a user id, or an address for somebody not signed up yet. */
  userId?: string | undefined;
  email?: string | undefined;
  subject: string;
  text: string;
  html?: string | undefined;
  /** Send once until resolveNotice(key) is called. */
  key?: string | undefined;
};

export type NotifyResult = { id: string; status: 'sent' | 'queued' | 'failed' | 'skipped' };

export const MAX_ATTEMPTS = 5;
const FIRST_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;
/** One minute, two, four, eight: the wait before the next try. */
export const retryWait = (attempts: number): number =>
  Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);

type Row = typeof notifications.$inferSelect;

async function trySend(
  row: Pick<Row, 'id' | 'address' | 'subject' | 'text' | 'html' | 'attempts'>,
  channel: Channel,
  database: Db,
  now: Date,
): Promise<'sent' | 'queued' | 'failed'> {
  const attempts = row.attempts + 1;
  try {
    await channel.send({
      to: row.address ?? '',
      subject: row.subject,
      text: row.text,
      html: row.html ?? undefined,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const exhausted = attempts >= MAX_ATTEMPTS;
    await database
      .update(notifications)
      .set({
        status: exhausted ? 'failed' : 'queued',
        attempts,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + retryWait(attempts)),
        error: reason,
      })
      .where(eq(notifications.id, row.id));
    // The address itself never reaches the log.
    log.error(
      { notificationId: row.id, attempts },
      exhausted
        ? `notification not sent after ${attempts} tries, giving up: ${reason}`
        : `notification not sent, will try again: ${reason}`,
    );
    return exhausted ? 'failed' : 'queued';
  }
  // Outside the catch: a database hiccup after a successful send must not
  // read as a failed send and have the message go out twice.
  await database
    .update(notifications)
    .set({ status: 'sent', sentAt: now, attempts, nextAttemptAt: null, error: null })
    .where(eq(notifications.id, row.id));
  return 'sent';
}

export async function notify(
  input: Notification,
  channel: Channel = emailChannel,
  database: Db = db,
): Promise<NotifyResult> {
  let address = input.email;
  if (!address && input.userId) {
    const [row] = await database
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    address = row?.email;
  }

  const id = randomUUID();
  const now = new Date();
  const base = {
    id,
    userId: input.userId ?? null,
    channel: channel.name,
    address: address ?? null,
    subject: input.subject,
    text: input.text,
    html: input.html ?? null,
    key: input.key ?? null,
  };

  if (input.key) {
    const [told] = await database
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.key, input.key),
          isNull(notifications.resolvedAt),
          inArray(notifications.status, ['sent', 'queued']),
        ),
      )
      .limit(1);
    if (told) {
      await database.insert(notifications).values({ ...base, status: 'skipped' });
      return { id, status: 'skipped' };
    }
  }

  if (!address) {
    const reason = 'no address to send to';
    await database.insert(notifications).values({ ...base, status: 'failed', error: reason });
    log.error({ notificationId: id }, `notification not sent: ${reason}`);
    return { id, status: 'failed' };
  }

  // Written with a retry time before the first try, so a process that dies
  // mid-send leaves a message the worker picks up in a minute rather than
  // one that is never sent and, with a key, blocks that key for ever.
  await database.insert(notifications).values({
    ...base,
    status: 'queued',
    nextAttemptAt: new Date(now.getTime() + retryWait(1)),
  });
  const status = await trySend({ ...base, attempts: 0 }, channel, database, now);
  return { id, status };
}

/**
 * Another go at every message whose wait is over. Called by the worker on
 * each tick; a handful at a time so one bad hour cannot hold the tick.
 */
export async function retryQueued(
  now: Date = new Date(),
  channel: Channel = emailChannel,
  database: Db = db,
): Promise<number> {
  const due = await database
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, 'queued'), lte(notifications.nextAttemptAt, now)))
    .limit(20);
  let sent = 0;
  for (const row of due) {
    if ((await trySend(row, channel, database, now)) === 'sent') sent += 1;
  }
  return sent;
}

/** The problem behind this key is over; the next occurrence is told again. */
export async function resolveNotice(key: string, database: Db = db): Promise<void> {
  await database
    .update(notifications)
    .set({ resolvedAt: new Date() })
    .where(and(eq(notifications.key, key), isNull(notifications.resolvedAt)));
}

export type { Channel, Message } from './email.ts';

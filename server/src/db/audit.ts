// Every change to a record people care about leaves a line here: who, what,
// when, and which fields moved from what to what. There is no history screen
// beyond a plain list — the point is being able to answer "who changed this
// and when" a month later.
import { randomUUID } from 'node:crypto';
import type { Db } from './index.ts';
import { auditLog } from './schema.ts';
import { TRACKING_COLUMNS } from './tracking.ts';

export type AuditAction = 'created' | 'updated' | 'deleted' | 'restored';
export type Changes = Record<string, { from: unknown; to: unknown }>;

type Row = Record<string, unknown> | null | undefined;

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value === undefined ? null : value;
}

const same = (a: unknown, b: unknown): boolean =>
  a === b ||
  (a !== null && b !== null && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

/**
 * What changed between two versions of a row. The tracking columns are left
 * out: they move on every write and would bury the field that actually
 * changed. A creation records the values it started with, a deletion the ones
 * it ended with.
 */
export function diff(before: Row, after: Row): Changes {
  const changes: Changes = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if ((TRACKING_COLUMNS as readonly string[]).includes(key)) continue;
    const from = normalise(before?.[key]);
    const to = normalise(after?.[key]);
    if (!same(from, to)) changes[key] = { from, to };
  }
  return changes;
}

/**
 * Fields whose values the history keeps out of its own copy. The history is
 * read far more widely than the record it describes and is never cleaned up,
 * so an e-mail address written into it would outlive the person's account and
 * travel with every backup. The line still says the address changed; it just
 * does not say what to.
 */
const REDACTED: Record<string, readonly string[]> = { user: ['email'] };

export function redact(entity: string, changes: Changes): Changes {
  const fields = REDACTED[entity];
  if (!fields) return changes;
  const out: Changes = { ...changes };
  for (const field of fields) {
    const change = out[field];
    if (!change) continue;
    out[field] = {
      from: change.from === null ? null : `[${field}]`,
      to: change.to === null ? null : `[${field}]`,
    };
  }
  return out;
}

export async function recordChange(
  db: Db,
  input: {
    actorId: string | null;
    entity: string;
    entityId: string;
    action: AuditAction;
    before?: Row;
    after?: Row;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    id: randomUUID(),
    at: new Date(),
    actorId: input.actorId,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    changes: redact(input.entity, diff(input.before, input.after)),
  });
}

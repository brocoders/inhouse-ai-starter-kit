// "Who changed this, and when?" — the plain list, for any record in the app.
// Same page grammar as every other list: a cursor that is the id of the last
// row shown, a total, and the next cursor.
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { AuditPage, ListQuery, type AuditEvent } from '../../../shared/schemas.ts';
import { requireRole, type AppEnv } from '../auth.ts';
import { db } from '../db/index.ts';
import { auditLog, user } from '../db/schema.ts';

export const AuditQuery = ListQuery.extend({
  entity: z.string().max(80).optional(),
  entityId: z.string().max(80).optional(),
});

const after = (cursor: string): SQL =>
  sql`exists (select 1 from ${auditLog} c where c.id = ${cursor} and (${auditLog.at} < c.at or (${auditLog.at} = c.at and ${auditLog.id} > c.id)))`;

export const auditRoutes = new Hono<AppEnv>().get(
  '/',
  requireRole('viewer'),
  zValidator('query', AuditQuery),
  async (c) => {
    const query = c.req.valid('query');
    const where: SQL[] = [];
    if (query.entity) where.push(eq(auditLog.entity, query.entity));
    if (query.entityId) where.push(eq(auditLog.entityId, query.entityId));

    const counted = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where.length ? and(...where) : undefined);
    const total = Number(counted[0]?.total ?? 0);

    const conditions = [...where, ...(query.cursor ? [after(query.cursor)] : [])];
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        actorId: auditLog.actorId,
        actorName: user.name,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        action: auditLog.action,
        changes: auditLog.changes,
      })
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.at), asc(auditLog.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const body: z.infer<typeof AuditPage> = {
      rows: page.map((row): AuditEvent => ({
        id: row.id,
        at: row.at.toISOString(),
        actorId: row.actorId,
        actorName: row.actorName,
        entity: row.entity,
        entityId: row.entityId,
        action: row.action,
        changes: (row.changes ?? {}) as AuditEvent['changes'],
      })),
      total,
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
    return c.json(body);
  },
);

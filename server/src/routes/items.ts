// The worked example: one list, one record, one form, history, and the
// filters a real screen needs. Copy this file when you add your own thing and
// delete it when you no longer need the example.
//
// Two rules it exists to demonstrate. Filtering, sorting and cutting the page
// all happen in SQL — a list never fetches a table to sift it in JavaScript.
// And a page is a keyset: the client sends back the id of the last row it
// showed, and the database walks on from there, which stays fast at any depth
// and never repeats or skips a row when somebody adds one meanwhile.
import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  ItemInput,
  ItemListQuery,
  ItemPage,
  ItemPatchInput,
  type Item,
} from '../../../shared/schemas.ts';
import { requireRole, type AppEnv } from '../auth.ts';
import { config } from '../config.ts';
import { db, type Db } from '../db/index.ts';
import { recordChange } from '../db/audit.ts';
import { items, user } from '../db/schema.ts';
import { AppError, notFound, orFail } from '../errors.ts';
import { addDays, calendarDay } from '../time.ts';

type ItemRow = typeof items.$inferSelect & { assigneeName: string | null };

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    dueOn: row.dueOn,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Everything except the cursor: the filters the person chose. `total` is
 * counted with exactly these, so it is the size of the whole filtered list and
 * not of what is left after the cursor.
 *
 * "Today" is a calendar day in the app's time zone, worked out once here and
 * passed to the database as a date. A day in Lisbon is not a day in UTC, and
 * at one minute past midnight the difference is the whole answer.
 *
 * It is the app's zone and nobody's own. Two people looking at "overdue" at
 * the same moment must see the same list, and the reminder job and the home
 * page count against the same day; a person's own zone is for showing them a
 * time, never for deciding which records match.
 */
function filters(query: z.infer<typeof ItemListQuery>): SQL[] {
  const where: SQL[] = [isNull(items.deletedAt)];
  if (query.q) {
    const needle = query.q.toLowerCase();
    where.push(
      sql`(position(${needle} in lower(${items.title})) > 0 or position(${needle} in lower(coalesce(${items.notes}, ''))) > 0)`,
    );
  }
  if (query.status) where.push(eq(items.status, query.status));
  if (query.assigneeId) where.push(eq(items.assigneeId, query.assigneeId));
  if (query.due) {
    const today = calendarDay(new Date(), config.timeZone);
    if (query.due === 'none') where.push(isNull(items.dueOn));
    if (query.due === 'overdue')
      where.push(and(isNotNull(items.dueOn), lt(items.dueOn, today)) as SQL);
    if (query.due === 'week') {
      where.push(sql`${items.dueOn} >= ${today} and ${items.dueOn} <= ${addDays(today, 6)}`);
    }
  }
  return where;
}

/**
 * Walk on from the row the client last showed.
 *
 * The cursor is that row's id and nothing more, so the client cannot skew the
 * page by editing a timestamp in the URL; the database looks the pair up for
 * itself. The two halves of the comparison sort in opposite directions —
 * newest first, then id ascending to break a tie — so this is written out
 * rather than as a tuple comparison, and it matches the
 * `(created_at desc, id)` index exactly.
 */
const after = (cursor: string): SQL =>
  sql`exists (select 1 from ${items} c where c.id = ${cursor} and (${items.createdAt} < c.created_at or (${items.createdAt} = c.created_at and ${items.id} > c.id)))`;

export async function listItems(
  database: Db,
  query: z.infer<typeof ItemListQuery>,
): Promise<z.infer<typeof ItemPage>> {
  const where = filters(query);

  const counted = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(items)
    .where(and(...where));
  const total = Number(counted[0]?.total ?? 0);

  const rows = await database
    .select({ ...getTableColumns(items), assigneeName: user.name })
    .from(items)
    .leftJoin(user, eq(items.assigneeId, user.id))
    .where(and(...where, ...(query.cursor ? [after(query.cursor)] : [])))
    .orderBy(desc(items.createdAt), asc(items.id))
    // One more than asked for, so we know whether there is another page
    // without counting again.
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  return {
    rows: page.map(toItem),
    total,
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

async function readItem(database: Db, id: string): Promise<ItemRow | undefined> {
  const [row] = await database
    .select({ ...getTableColumns(items), assigneeName: user.name })
    .from(items)
    .leftJoin(user, eq(items.assigneeId, user.id))
    .where(and(eq(items.id, id), isNull(items.deletedAt)))
    .limit(1);
  return row;
}

const idParam = z.object({ id: z.string().min(1) });

export const itemsRoutes = new Hono<AppEnv>()
  .get('/', requireRole('viewer'), zValidator('query', ItemListQuery, orFail), async (c) => {
    return c.json(await listItems(db, c.req.valid('query')));
  })
  .get('/:id', requireRole('viewer'), zValidator('param', idParam, orFail), async (c) => {
    const row = await readItem(db, c.req.valid('param').id);
    if (!row) throw notFound('That item');
    return c.json(toItem(row));
  })
  .post('/', requireRole('member'), zValidator('json', ItemInput, orFail), async (c) => {
    const input = c.req.valid('json');
    const actor = c.get('user');
    const now = new Date();
    const id = randomUUID();
    await db.insert(items).values({
      id,
      title: input.title,
      notes: input.notes ?? null,
      status: input.status,
      dueOn: input.dueOn ?? null,
      assigneeId: input.assigneeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    const created = await readItem(db, id);
    if (!created) throw notFound('The item you just created');
    await recordChange(db, {
      actorId: actor.id,
      entity: 'items',
      entityId: id,
      action: 'created',
      after: toItem(created),
    });
    return c.json(toItem(created), 201);
  })
  .patch(
    '/:id',
    requireRole('member'),
    zValidator('param', idParam, orFail),
    zValidator('json', ItemPatchInput, orFail),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const actor = c.get('user');
      const before = await readItem(db, id);
      if (!before) throw notFound('That item');

      // Two people had the record open. Whoever saved second is told rather
      // than quietly winning.
      if (input.updatedAt && Date.parse(input.updatedAt) < before.updatedAt.getTime()) {
        throw new AppError(
          'conflict',
          'Somebody else changed this item while you had it open. Reload it and make your change again.',
        );
      }

      await db
        .update(items)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          updatedAt: new Date(),
          updatedBy: actor.id,
        })
        .where(eq(items.id, id));

      const after = await readItem(db, id);
      if (!after) throw notFound('That item');
      await recordChange(db, {
        actorId: actor.id,
        entity: 'items',
        entityId: id,
        action: 'updated',
        before: toItem(before),
        after: toItem(after),
      });
      return c.json(toItem(after));
    },
  )
  .delete('/:id', requireRole('owner'), zValidator('param', idParam, orFail), async (c) => {
    const { id } = c.req.valid('param');
    const actor = c.get('user');
    const before = await readItem(db, id);
    if (!before) throw notFound('That item');
    // Nothing is erased: the row keeps its history and drops out of lists.
    await db
      .update(items)
      .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(items.id, id));
    await recordChange(db, {
      actorId: actor.id,
      entity: 'items',
      entityId: id,
      action: 'deleted',
      before: toItem(before),
    });
    return c.body(null, 204);
  });

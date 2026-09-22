// The list is the part of an app people use all day, so it is the part with
// the most ways to be subtly wrong: a filter that also changes the order, a
// page that repeats a row, a total that counts what is left rather than what
// matched.
//
// The defence is an oracle. The same rows are filtered and sorted in plain
// JavaScript here, and every filter is then walked page by page through the
// real endpoint and compared — not just the set of rows, but their order and
// the totals. If SQL and the oracle ever disagree, one of them is wrong and
// the test says which filter it was.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  actAs,
  call,
  closeDb,
  json,
  makeUser,
  ready,
  reset,
  type TestUser,
} from '../test/helpers.ts';
import type { ApiError, AuditEvent, Item, ItemListQuery } from '../../../shared/schemas.ts';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { items, user } from '../db/schema.ts';
import { addDays, calendarDay } from '../time.ts';

type Page = { rows: Item[]; total: number; nextCursor: string | null };
type Seeded = {
  id: string;
  title: string;
  status: 'open' | 'done';
  dueOn: string | null;
  assigneeId: string | null;
  createdAt: Date;
};

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;
let seeded: Seeded[] = [];
let today: string;

before(async () => {
  await ready();
});
after(closeDb);

async function seedItems(): Promise<void> {
  today = calendarDay();
  const rows: (typeof items.$inferInsert)[] = [];
  seeded = [];
  const base = Date.parse('2026-05-01T09:00:00Z');
  for (let i = 0; i < 37; i++) {
    const id = randomUUID();
    // Two rows share each timestamp, which is what makes the tie-break on id
    // worth testing: without it a page boundary could repeat or skip a row.
    const createdAt = new Date(base + Math.floor(i / 2) * 3_600_000);
    const status = i % 3 === 0 ? 'done' : 'open';
    const dueOn = i % 5 === 0 ? null : addDays(today, [-10, -2, 0, 3, 8, 40][i % 6] ?? 0);
    const assigneeId = i % 4 === 0 ? member.id : i % 4 === 1 ? viewer.id : null;
    const title = i % 7 === 0 ? `Renew the ${i} insurance` : `Task number ${i}`;
    rows.push({
      id,
      title,
      notes: i % 6 === 0 ? 'A note mentioning kettle' : null,
      status,
      dueOn,
      assigneeId,
      createdAt,
      updatedAt: createdAt,
      createdBy: owner.id,
      updatedBy: owner.id,
    });
    seeded.push({ id, title, status, dueOn, assigneeId, createdAt });
  }
  await db.insert(items).values(rows);
}

/** The answer the endpoint should give, worked out without SQL. */
function oracle(query: Partial<ItemListQuery>): Seeded[] {
  let rows = [...seeded];
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.assigneeId) rows = rows.filter((r) => r.assigneeId === query.assigneeId);
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
  }
  if (query.due === 'none') rows = rows.filter((r) => r.dueOn === null);
  if (query.due === 'overdue') rows = rows.filter((r) => r.dueOn !== null && r.dueOn < today);
  if (query.due === 'week') {
    const end = addDays(today, 6);
    rows = rows.filter((r) => r.dueOn !== null && r.dueOn >= today && r.dueOn <= end);
  }
  return rows.sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/** Walk the whole list one page at a time, the way a screen scrolls it. */
async function walk(
  query: Partial<ItemListQuery>,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let total = 0;
  for (let guard = 0; guard < 50; guard++) {
    const search = new URLSearchParams({ limit: String(limit) });
    for (const [key, value] of Object.entries(query)) if (value) search.set(key, String(value));
    if (cursor) search.set('cursor', cursor);
    const response = await call('GET', `/api/items?${search}`);
    assert.equal(response.status, 200, await response.clone().text());
    const page = await json<Page>(response);
    total = page.total;
    ids.push(...page.rows.map((row) => row.id));
    assert.ok(page.rows.length <= limit, 'a page came back longer than asked for');
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { ids, total };
}

describe('the list of items', () => {
  beforeEach(async () => {
    await reset();
    owner = await makeUser('owner');
    member = await makeUser('member');
    viewer = await makeUser('viewer');
    await seedItems();
    actAs(owner);
  });

  it('gives every filter the same rows, in the same order, as working it out by hand', async () => {
    const queries: Partial<ItemListQuery>[] = [
      {},
      { status: 'open' },
      { status: 'done' },
      { due: 'overdue' },
      { due: 'week' },
      { due: 'none' },
      { q: 'renew' },
      { q: 'Task number 1' },
      { status: 'open', due: 'overdue' },
      { status: 'done', q: 'task' },
    ];
    for (const query of queries) {
      const expected = oracle(query).map((row) => row.id);
      for (const limit of [3, 10, 200]) {
        const got = await walk(query, limit);
        assert.deepEqual(
          got.ids,
          expected,
          `wrong rows for ${JSON.stringify(query)} at limit ${limit}`,
        );
        assert.equal(got.total, expected.length, `wrong total for ${JSON.stringify(query)}`);
      }
    }
  });

  it('filters by who it is for', async () => {
    for (const person of [member, viewer]) {
      const expected = oracle({ assigneeId: person.id }).map((row) => row.id);
      const got = await walk({ assigneeId: person.id }, 4);
      assert.deepEqual(got.ids, expected);
      assert.ok(expected.length > 0, 'the fixture should give this person some items');
    }
  });

  it('names the person an item is for', async () => {
    const response = await call('GET', `/api/items?assigneeId=${member.id}&limit=1`);
    const page = await json<Page>(response);
    assert.equal(page.rows[0]?.assigneeName, member.name);
  });

  it('counts the whole filtered list, not what is left after the cursor', async () => {
    const first = await json<Page>(await call('GET', '/api/items?limit=5'));
    const second = await json<Page>(
      await call('GET', `/api/items?limit=5&cursor=${first.nextCursor}`),
    );
    assert.equal(first.total, seeded.length);
    assert.equal(second.total, seeded.length);
  });

  it('leaves a deleted item out of the list but keeps its history', async () => {
    const target = oracle({})[0];
    assert.ok(target);
    const deleted = await call('DELETE', `/api/items/${target.id}`);
    assert.equal(deleted.status, 204);

    const listed = await walk({}, 10);
    assert.equal(listed.ids.includes(target.id), false);
    assert.equal(listed.total, seeded.length - 1);
    assert.equal((await call('GET', `/api/items/${target.id}`)).status, 404);

    const history = await json<{ rows: AuditEvent[] }>(
      await call('GET', `/api/audit?entity=items&entityId=${target.id}`),
    );
    assert.equal(history.rows[0]?.action, 'deleted');
  });
});

describe('what "due" means', () => {
  beforeEach(async () => {
    await reset();
    owner = await makeUser('owner');
    member = await makeUser('member');
    viewer = await makeUser('viewer');
    await seedItems();
    actAs(owner);
  });

  it('draws the day boundary where the app lives, not at midnight UTC', async () => {
    // Kiritimati is fourteen hours ahead of UTC and Niue eleven behind, so at
    // every instant of the year it is a different date in the two of them.
    // One item, due today in Niue: in Kiritimati that day has already gone.
    // Whatever hour this test runs at, the two answers must differ — which
    // they only do if the boundary is worked out per time zone.
    await reset();
    const ahead = 'Pacific/Kiritimati';
    const behind = 'Pacific/Niue';
    assert.ok(calendarDay(new Date(), ahead) > calendarDay(new Date(), behind));

    const created = new Date();
    await db.insert(items).values({
      id: randomUUID(),
      title: 'Due where the app lives',
      status: 'open',
      dueOn: calendarDay(new Date(), behind),
      createdAt: created,
      updatedAt: created,
    });

    const inNiue = await makeUser('owner', { email: 'niue@example.com' });
    const inKiritimati = await makeUser('owner', { email: 'kiritimati@example.com' });
    await db.update(user).set({ timeZone: behind }).where(eq(user.id, inNiue.id));
    await db.update(user).set({ timeZone: ahead }).where(eq(user.id, inKiritimati.id));

    actAs(inNiue);
    assert.equal((await json<Page>(await call('GET', '/api/items?due=overdue'))).total, 0);
    assert.equal((await json<Page>(await call('GET', '/api/items?due=week'))).total, 1);

    actAs(inKiritimati);
    assert.equal((await json<Page>(await call('GET', '/api/items?due=overdue'))).total, 1);
    assert.equal((await json<Page>(await call('GET', '/api/items?due=week'))).total, 0);
  });
});

describe('changing an item', () => {
  beforeEach(async () => {
    await reset();
    owner = await makeUser('owner');
    member = await makeUser('member');
    viewer = await makeUser('viewer');
    actAs(member);
  });

  it('records what changed, and who changed it', async () => {
    const created = await json<Item>(
      await call('POST', '/api/items', { title: 'Order the chairs', status: 'open' }),
    );
    actAs(owner);
    await call('PATCH', `/api/items/${created.id}`, {
      status: 'done',
      title: 'Order the chairs (blue)',
    });

    const history = await json<{ rows: AuditEvent[]; total: number }>(
      await call('GET', `/api/audit?entity=items&entityId=${created.id}`),
    );
    assert.equal(history.total, 2);
    const [changed, made] = history.rows;
    assert.equal(changed?.action, 'updated');
    assert.equal(changed?.actorName, owner.name);
    assert.deepEqual(changed?.changes.status, { from: 'open', to: 'done' });
    assert.deepEqual(changed?.changes.title, {
      from: 'Order the chairs',
      to: 'Order the chairs (blue)',
    });
    // The four tracking columns move on every write and would bury the change.
    assert.equal('updatedAt' in (changed?.changes ?? {}), false);
    assert.equal('updatedBy' in (changed?.changes ?? {}), false);
    assert.equal(made?.action, 'created');
    assert.equal(made?.actorName, member.name);
  });

  it('refuses a save from somebody working off an older copy', async () => {
    const created = await json<Item>(await call('POST', '/api/items', { title: 'Book the hall' }));
    // Somebody else saves first.
    await call('PATCH', `/api/items/${created.id}`, { title: 'Book the hall for Friday' });

    const stale = await call('PATCH', `/api/items/${created.id}`, {
      title: 'Book the hall for Thursday',
      updatedAt: created.updatedAt,
    });
    assert.equal(stale.status, 409);
    const body = await json<ApiError>(stale);
    assert.equal(body.kind, 'conflict');
    assert.match(body.message, /changed this item/i);
    assert.ok(body.requestId);

    const now = await json<Item>(await call('GET', `/api/items/${created.id}`));
    assert.equal(now.title, 'Book the hall for Friday');
  });

  it('accepts a save from somebody with the current copy', async () => {
    const created = await json<Item>(
      await call('POST', '/api/items', { title: 'Pay the invoice' }),
    );
    const saved = await call('PATCH', `/api/items/${created.id}`, {
      title: 'Pay the invoice today',
      updatedAt: created.updatedAt,
    });
    assert.equal(saved.status, 200);
  });

  it('does not reopen a finished item just because the form said nothing about it', async () => {
    const created = await json<Item>(
      await call('POST', '/api/items', { title: 'Close the books', status: 'done' }),
    );
    const patched = await json<Item>(
      await call('PATCH', `/api/items/${created.id}`, { notes: 'March' }),
    );
    assert.equal(patched.status, 'done');
  });
});

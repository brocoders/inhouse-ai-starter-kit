// A server made of memory, so the screens can be looked at before the real one
// exists — and so a screenshot of every screen can be taken in a script with
// nothing running behind it.
//
//   VITE_MOCK_API=1 pnpm dev:frontend
//
// It is guarded by import.meta.env.DEV as well as the flag, so the whole file
// disappears from a production build: the condition is false at build time and
// the bundler drops the branch and the import with it.
import {
  type Attachment,
  type AuditEvent,
  type Item,
  type ItemStatus,
  type Me,
  type OpsStatus,
  type Role,
  type User,
} from '@shared/schemas';

const DAY = 86_400_000;
const now = Date.now();
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();
const day = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

const users: User[] = [
  {
    id: 'u1',
    name: 'Rita Salmiņa',
    email: 'rita@example.com',
    role: 'owner',
    active: true,
    lastSeenAt: iso(-0.01),
    createdAt: iso(-320),
  },
  {
    id: 'u2',
    name: 'Tomas Berg',
    email: 'tomas@example.com',
    role: 'member',
    active: true,
    lastSeenAt: iso(-1.4),
    createdAt: iso(-210),
  },
  {
    id: 'u3',
    name: 'Nadia Farouk',
    email: 'nadia@example.com',
    role: 'member',
    active: true,
    lastSeenAt: iso(-6),
    createdAt: iso(-140),
  },
  {
    id: 'u4',
    name: 'Petros Iliev',
    email: 'petros@example.com',
    role: 'viewer',
    active: false,
    lastSeenAt: null,
    createdAt: iso(-40),
  },
];

const me: Me = { ...users[0]!, locale: 'en-GB', timeZone: 'Europe/Riga' };

// Sixty rows is enough for the list to page twice and for the virtualiser to
// have something to leave out of the document.
const titles = [
  'Renew the office insurance',
  'Send the quarterly figures to the accountant',
  'Order replacement keycards',
  'Book the team lunch',
  'Review the supplier contract',
  'Chase the unpaid invoice',
  'Update the emergency contact list',
  'Schedule the fire alarm test',
  'Collect the signed NDAs',
  'Move the archive boxes',
  'Renew the domain name',
  'Interview the second candidate',
];
const notes = [
  'Ask for the two-year price before agreeing to anything.',
  null,
  'The last one took three weeks, so start early.',
  null,
  'They said to call after the tenth.',
];

function makeItems(): Item[] {
  const rows: Item[] = [];
  for (let n = 0; n < 60; n += 1) {
    const done = n % 3 === 0;
    const assignee = n % 5 === 4 ? null : users[n % 3]!;
    // A spread of due days: some past, some this week, some empty.
    const due = n % 7 === 6 ? null : day(((n * 13) % 40) - 12);
    rows.push({
      id: `i${String(n + 1).padStart(3, '0')}`,
      title: `${titles[n % titles.length]}${n >= titles.length ? ` (${Math.floor(n / titles.length) + 1})` : ''}`,
      notes: notes[n % notes.length] ?? null,
      status: (done ? 'done' : 'open') as ItemStatus,
      dueOn: due,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      createdAt: iso(-((n % 30) + 1)),
      updatedAt: iso(-((n * 17) % 56) - 0.2),
      createdBy: users[n % 3]!.id,
      updatedBy: users[(n + 1) % 3]!.id,
    });
  }
  return rows;
}

let items = makeItems();

const audit: AuditEvent[] = items.slice(0, 24).map((item, n) => ({
  id: `a${n}`,
  at: iso(-(n * 0.4) - 0.05),
  actorId: users[n % 3]!.id,
  actorName: users[n % 3]!.name,
  entity: 'items',
  entityId: item.id,
  action: n % 6 === 0 ? 'created' : 'updated',
  changes:
    n % 6 === 0
      ? {}
      : n % 3 === 0
        ? { status: { from: 'open', to: 'done' } }
        : { dueOn: { from: day(-3), to: day(4) } },
}));

const attachments: Attachment[] = [
  {
    id: 'f1',
    entity: 'items',
    entityId: 'i001',
    fileName: 'insurance-quote.pdf',
    contentType: 'application/pdf',
    size: 284_133,
    createdAt: iso(-2),
    createdBy: 'u1',
  },
  {
    id: 'f2',
    entity: 'items',
    entityId: 'i001',
    fileName: 'last-year-policy.pdf',
    contentType: 'application/pdf',
    size: 1_204_991,
    createdAt: iso(-9),
    createdBy: 'u2',
  },
];

const ops: OpsStatus = {
  release: 'a1b2c3d',
  startedAt: iso(-4),
  schemaVersion: 12,
  database: 'ok',
  problems: [
    {
      code: 'backup_old',
      severity: 'warning',
      message: 'The last backup is two days old. It should run every night.',
      since: iso(-2),
      href: null,
    },
  ],
  jobs: [
    {
      name: 'send-due-reminders',
      queued: 0,
      running: 0,
      failed24h: 0,
      lastSucceededAt: iso(-0.3),
      lastFailedAt: null,
      lastError: null,
    },
    {
      name: 'nightly-backup',
      queued: 1,
      running: 0,
      failed24h: 2,
      lastSucceededAt: iso(-2),
      lastFailedAt: iso(-0.5),
      lastError: 'pg_dump: connection refused',
    },
  ],
  recentErrors: [
    {
      at: iso(-0.5),
      requestId: 'req_8812',
      message: 'pg_dump: connection refused',
      count: 2,
    },
    { at: iso(-0.9), requestId: null, message: 'Resend: 429 rate limited', count: 1 },
  ],
  disk: { freeBytes: 18_402_000_000, totalBytes: 79_000_000_000 },
  lastBackupAt: iso(-2),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function fail(kind: string, message: string, status: number): Response {
  return json({ kind, message, requestId: 'mock' }, status);
}

/**
 * The same answer `server/src/routes/items.ts` gives, rule for rule: title or
 * notes for the search, "overdue" and "within a week" counted from today
 * whatever the status, newest first with the id breaking a tie, and a cursor
 * nobody recognises answered with an empty page rather than the first one.
 * A screenshot of the mock is only worth taking if it shows the real order.
 */
function listItems(params: URLSearchParams) {
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const status = params.get('status');
  const due = params.get('due');
  const assigneeId = params.get('assigneeId');
  const today = day(0);
  const weekEnd = day(6);
  let rows = items.filter((item) => {
    if (q && !item.title.toLowerCase().includes(q) && !(item.notes ?? '').toLowerCase().includes(q))
      return false;
    if (status && item.status !== status) return false;
    if (assigneeId && item.assigneeId !== assigneeId) return false;
    if (due === 'none' && item.dueOn !== null) return false;
    if (due === 'overdue' && !(item.dueOn && item.dueOn < today)) return false;
    if (due === 'week' && !(item.dueOn && item.dueOn >= today && item.dueOn <= weekEnd))
      return false;
    return true;
  });
  rows = [...rows].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const total = rows.length;
  const limit = Math.min(200, Number(params.get('limit') ?? 50) || 50);
  const cursor = params.get('cursor');
  const at = cursor ? rows.findIndex((row) => row.id === cursor) : -1;
  if (cursor && at < 0) return { rows: [], total, nextCursor: null };
  const start = at + 1;
  const page = rows.slice(start, start + limit);
  const nextCursor = start + limit < total ? (page[page.length - 1]?.id ?? null) : null;
  return { rows: page, total, nextCursor };
}

async function answer(url: URL, request: Request): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const body = async () =>
    (await request
      .clone()
      .json()
      .catch(() => ({}))) as Record<string, unknown>;

  if (path === '/api/me' && method === 'GET') return json(me);
  if (path === '/api/me' && method === 'PATCH') {
    const input = await body();
    if (typeof input.name === 'string') me.name = input.name;
    return json(me);
  }

  if (path === '/api/items' && method === 'GET') return json(listItems(url.searchParams));
  if (path === '/api/items' && method === 'POST') {
    const input = await body();
    const assignee = users.find((u) => u.id === input.assigneeId) ?? null;
    const created: Item = {
      id: `i${String(items.length + 1).padStart(3, '0')}`,
      title: String(input.title ?? ''),
      notes: (input.notes as string | null) ?? null,
      status: (input.status as ItemStatus) ?? 'open',
      dueOn: (input.dueOn as string | null) ?? null,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      createdAt: iso(0),
      updatedAt: iso(0),
      createdBy: me.id,
      updatedBy: me.id,
    };
    items = [created, ...items];
    return json(created, 201);
  }

  const itemMatch = /^\/api\/items\/([^/]+)$/.exec(path);
  if (itemMatch) {
    const id = itemMatch[1]!;
    const found = items.find((row) => row.id === id);
    if (!found) return fail('not_found', 'There is no item with that address.', 404);
    if (method === 'GET') return json(found);
    if (method === 'PATCH') {
      const input = await body();
      const assignee =
        'assigneeId' in input ? (users.find((u) => u.id === input.assigneeId) ?? null) : undefined;
      const updated: Item = {
        ...found,
        ...(input.title !== undefined ? { title: String(input.title) } : {}),
        ...(input.notes !== undefined ? { notes: (input.notes as string | null) ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status as ItemStatus } : {}),
        ...(input.dueOn !== undefined ? { dueOn: (input.dueOn as string | null) ?? null } : {}),
        ...(assignee !== undefined
          ? { assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? null }
          : {}),
        updatedAt: iso(0),
        updatedBy: me.id,
      };
      items = items.map((row) => (row.id === id ? updated : row));
      return json(updated);
    }
    if (method === 'DELETE') {
      items = items.filter((row) => row.id !== id);
      return new Response(null, { status: 204 });
    }
  }

  if (path === '/api/audit') {
    const entity = url.searchParams.get('entity');
    const entityId = url.searchParams.get('entityId');
    const rows = audit.filter(
      (event) => (!entity || event.entity === entity) && (!entityId || event.entityId === entityId),
    );
    const limit = Number(url.searchParams.get('limit') ?? 20) || 20;
    return json({ rows: rows.slice(0, limit), total: rows.length, nextCursor: null });
  }

  // One page of everybody, by name — the server's `UserPage`.
  if (path === '/api/users' && method === 'GET') {
    const rows = [...users].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1,
    );
    return json({ rows, total: rows.length, nextCursor: null });
  }
  if (path === '/api/users' && method === 'POST') {
    const input = await body();
    const created: User = {
      id: `u${users.length + 1}`,
      name: String(input.name ?? ''),
      email: String(input.email ?? ''),
      role: (input.role as Role) ?? 'viewer',
      active: true,
      lastSeenAt: null,
      createdAt: iso(0),
    };
    users.push(created);
    return json(created, 201);
  }
  const userMatch = /^\/api\/users\/([^/]+)$/.exec(path);
  if (userMatch && method === 'PATCH') {
    const id = userMatch[1]!;
    const index = users.findIndex((row) => row.id === id);
    if (index < 0) return fail('not_found', 'There is no such person.', 404);
    const input = await body();
    users[index] = {
      ...users[index]!,
      ...(input.role !== undefined ? { role: input.role as Role } : {}),
      ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
    };
    return json(users[index]);
  }

  if (path === '/api/ops') return json(ops);

  if (path === '/api/attachments' && method === 'GET') {
    const entityId = url.searchParams.get('entityId');
    return json(attachments.filter((file) => !entityId || file.entityId === entityId));
  }
  if (path === '/api/attachments' && method === 'POST') {
    const created: Attachment = {
      id: `f${attachments.length + 1}`,
      entity: 'items',
      entityId: url.searchParams.get('entityId') ?? 'i001',
      fileName: 'new-file.pdf',
      contentType: 'application/pdf',
      size: 12_345,
      createdAt: iso(0),
      createdBy: me.id,
    };
    attachments.push(created);
    return json(created, 201);
  }

  if (path.startsWith('/api/auth/')) return json({ status: true });
  if (path.startsWith('/api/')) return fail('not_found', `No mock for ${method} ${path}.`, 404);
  return null;
}

/** Puts the memory server in front of fetch. Called once, from main.tsx. */
export function installMockApi(): void {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const url = new URL(request.url, window.location.origin);
    if (url.origin !== window.location.origin) return real(input as RequestInfo, init);
    // A little latency, so skeletons and disabled buttons are visible in
    // development rather than only in theory.
    const response = await answer(url, request);
    if (!response) return real(input as RequestInfo, init);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return response;
  };
  // eslint-disable-next-line no-console
  console.info('[mock] the API is being answered from memory');
}

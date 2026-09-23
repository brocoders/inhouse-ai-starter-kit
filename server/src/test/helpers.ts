// What every test file needs: a migrated database of its own, a way to be
// somebody, and a way to call the API.
//
// `node --test` runs each file in its own process, and `config.ts` gives that
// process its own folder and its own in-memory database. So the database here
// is already private to this file — there is nothing to isolate between
// files, only between tests, which `reset()` does.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Role } from '../../../shared/schemas.ts';
import { app } from '../app.ts';
import { auth } from '../auth.ts';
import { config } from '../config.ts';
import { db, handle } from '../db/index.ts';
import { migrateDb } from '../db/migrate.ts';
import { user } from '../db/schema.ts';
import { clearRecentErrors } from '../log.ts';
import { lastOutboxMessage } from '../notify/email.ts';

let migrated: Promise<void> | undefined;

export async function ready(): Promise<void> {
  migrated ??= migrateDb(handle);
  await migrated;
}

/** Empty every table, so one test cannot explain another one's result. */
export async function reset(): Promise<void> {
  await ready();
  await db.execute(
    sql`truncate table items, audit_log, attachments, jobs, notifications, schedules, session, account, verification, "user" restart identity cascade`,
  );
  clearRecentErrors();
  config.devAutoSignInEmail = undefined;
}

export type TestUser = { id: string; name: string; email: string; role: Role };

export async function makeUser(
  role: Role,
  overrides: { name?: string; email?: string; active?: boolean } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const name = overrides.name ?? `${role[0]?.toUpperCase()}${role.slice(1)} Person`;
  const email = overrides.email ?? `${role}-${id.slice(0, 8)}@example.com`;
  const now = new Date();
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    role,
    active: overrides.active ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return { id, name, email, role };
}

/**
 * Make the next requests come from this person.
 *
 * It uses the same development stand-in the screenshot script uses, which goes
 * through `requireUser` exactly as a real session does — the role check, the
 * "turned off" check and `c.var.user` are all the code that runs in
 * production. The cookie half is covered separately: `sessionCookieFor` below
 * follows a real magic link, and `users.test.ts` checks every role through it.
 */
export function actAs(person: TestUser | { email: string } | undefined): void {
  config.devAutoSignInEmail = person?.email;
}

/**
 * A real session cookie for this person, got the way a person gets one: a
 * magic link is sent, the link in the outbox is opened, and the answer sets
 * the cookie. For the tests that must prove the cookie path enforces the same
 * rules as the stand-in `actAs` uses.
 *
 * The link is asked for through the server's own API rather than the HTTP
 * endpoint, so the tests do not spend the sign-in rate limit on themselves.
 */
export async function sessionCookieFor(person: { email: string }): Promise<string> {
  await auth.api.signInMagicLink({
    body: { email: person.email, callbackURL: '/' },
    headers: new Headers(),
  });
  const link = lastOutboxMessage()?.body.match(/http:\/\/\S+/)?.[0];
  if (!link) throw new Error(`no sign-in link was sent to ${person.email}`);
  const opened = await app.request(link, { redirect: 'manual' });
  const cookie = opened.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`opening the link set no cookie (status ${opened.status})`);
  return cookie;
}

export async function signedOut(): Promise<void> {
  config.devAutoSignInEmail = undefined;
}

type Body = Record<string, unknown> | undefined;

export async function call(
  method: string,
  path: string,
  body?: Body,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Origin', config.appUrl);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return app.request(path, {
    ...init,
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function closeDb(): Promise<void> {
  await handle.close();
}

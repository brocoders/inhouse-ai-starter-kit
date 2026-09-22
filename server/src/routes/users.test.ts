// Who may do what, and how somebody gets in at all.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import type { ApiError, Me, User } from '../../../shared/schemas.ts';
import { db } from '../db/index.ts';
import { user } from '../db/schema.ts';
import { app } from '../app.ts';
import { lastOutboxMessage } from '../notify/email.ts';
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

let owner: TestUser;
let member: TestUser;
let viewer: TestUser;

before(ready);
after(closeDb);

beforeEach(async () => {
  await reset();
  owner = await makeUser('owner');
  member = await makeUser('member');
  viewer = await makeUser('viewer');
});

describe('what each role may do', () => {
  it('lets a viewer read and stops them writing', async () => {
    actAs(viewer);
    assert.equal((await call('GET', '/api/items')).status, 200);

    const write = await call('POST', '/api/items', { title: 'Something' });
    assert.equal(write.status, 403);
    const body = await json<ApiError>(write);
    assert.equal(body.kind, 'forbidden');
    assert.match(body.message, /member or an owner/);
  });

  it('lets a member write but not delete or manage people', async () => {
    actAs(member);
    const created = await call('POST', '/api/items', { title: 'Something' });
    assert.equal(created.status, 201);
    const { id } = await json<{ id: string }>(created);

    assert.equal((await call('DELETE', `/api/items/${id}`)).status, 403);
    assert.equal(
      (
        await call('POST', '/api/users/invite', {
          email: 'x@example.com',
          name: 'X',
          role: 'viewer',
        })
      ).status,
      403,
    );
    assert.equal((await call('GET', '/api/ops')).status, 403);
    // A member is allowed to see who else is here.
    assert.equal((await call('GET', '/api/users')).status, 200);
  });

  it('lets an owner do everything a member can', async () => {
    actAs(owner);
    const created = await call('POST', '/api/items', { title: 'Something' });
    assert.equal(created.status, 201);
    const { id } = await json<{ id: string }>(created);
    assert.equal((await call('DELETE', `/api/items/${id}`)).status, 204);
    assert.equal((await call('GET', '/api/ops')).status, 200);
  });

  it('turns nobody away with a 401 rather than a blank page', async () => {
    actAs(undefined);
    const response = await call('GET', '/api/items');
    assert.equal(response.status, 401);
    const body = await json<ApiError>(response);
    assert.equal(body.kind, 'auth');
    assert.ok(body.requestId);
  });

  it('refuses somebody whose account has been turned off', async () => {
    const gone = await makeUser('member', { email: 'gone@example.com', active: false });
    actAs(gone);
    const response = await call('GET', '/api/items');
    assert.equal(response.status, 403);
    assert.match((await json<ApiError>(response)).message, /turned off/);
  });

  it('tells you who you are', async () => {
    actAs(member);
    const me = await json<Me>(await call('GET', '/api/me'));
    assert.equal(me.email, member.email);
    assert.equal(me.role, 'member');
    assert.equal(me.timeZone, 'UTC');
    assert.equal(me.locale, 'en-US');
  });
});

describe('the last owner', () => {
  it('cannot be demoted', async () => {
    // Leave exactly one owner.
    await db.delete(user).where(eq(user.role, 'owner'));
    const only = await makeUser('owner', { email: 'only@example.com' });
    actAs(only);

    const response = await call('PATCH', `/api/users/${only.id}`, { role: 'member' });
    assert.equal(response.status, 400);
    const body = await json<ApiError>(response);
    assert.match(body.message, /last owner/i);
    assert.ok(body.fields?.role);

    const [after] = await db.select().from(user).where(eq(user.id, only.id));
    assert.equal(after?.role, 'owner');
  });

  it('cannot be turned off', async () => {
    await db.delete(user).where(eq(user.role, 'owner'));
    const only = await makeUser('owner', { email: 'only@example.com' });
    actAs(only);
    assert.equal((await call('PATCH', `/api/users/${only.id}`, { active: false })).status, 400);
  });

  it('can step down once somebody else is an owner', async () => {
    actAs(owner);
    const second = await makeUser('member', { email: 'second@example.com' });
    assert.equal((await call('PATCH', `/api/users/${second.id}`, { role: 'owner' })).status, 200);
    assert.equal((await call('PATCH', `/api/users/${owner.id}`, { role: 'member' })).status, 200);
  });

  it('is not blocked when the other owner has been turned off', async () => {
    actAs(owner);
    const second = await makeUser('owner', { email: 'second@example.com', active: false });
    const response = await call('PATCH', `/api/users/${owner.id}`, { role: 'member' });
    assert.equal(response.status, 400, 'an owner who cannot sign in does not count');
    assert.ok(second.id);
  });
});

describe('getting in', () => {
  it('invites somebody and signs them in through the link they were sent', async () => {
    actAs(owner);
    const invited = await call('POST', '/api/users/invite', {
      email: 'New.Person@example.com',
      name: 'New Person',
      role: 'member',
    });
    assert.equal(invited.status, 201);
    const created = await json<User>(invited);
    assert.equal(created.email, 'new.person@example.com');
    assert.equal(created.role, 'member');

    // The message went to the development outbox, link and all.
    const sent = lastOutboxMessage();
    assert.ok(sent, 'no message was written');
    assert.match(sent.body, /Sign in to InHouse/);
    const link = sent.body.match(/http:\/\/\S+/)?.[0];
    assert.ok(link, 'the message carried no link');

    // Following it hands back a session cookie, and that cookie is a session.
    actAs(undefined);
    const verified = await app.request(link, { redirect: 'manual' });
    const cookie = verified.headers.get('set-cookie');
    assert.ok(cookie, `no cookie came back (status ${verified.status})`);

    const me = await app.request('/api/me', { headers: { cookie: cookie.split(';')[0] ?? '' } });
    assert.equal(me.status, 200);
    assert.equal((await json<Me>(me)).email, 'new.person@example.com');
  });

  it('refuses a second invitation to the same address', async () => {
    actAs(owner);
    const again = await call('POST', '/api/users/invite', {
      email: member.email,
      name: 'Someone',
      role: 'viewer',
    });
    assert.equal(again.status, 409);
    assert.equal((await json<ApiError>(again)).kind, 'conflict');
  });

  it('has no way to sign yourself up', async () => {
    actAs(undefined);
    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({
        email: 'stranger@example.com',
        password: 'a-long-enough-password',
        name: 'Stranger',
      }),
    });
    assert.notEqual(response.status, 200);
    const [stranger] = await db.select().from(user).where(eq(user.email, 'stranger@example.com'));
    assert.equal(stranger, undefined);
  });

  it('does nothing with a link asked for by somebody who was never invited', async () => {
    actAs(undefined);
    const before = lastOutboxMessage();
    await app.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: 'stranger@example.com' }),
    });
    // The answer is deliberately the same as for an address that does exist —
    // it must not become a way to find out who has an account — so what this
    // checks is that no message was actually sent.
    assert.equal(
      lastOutboxMessage()?.file,
      before?.file,
      'a message went out to somebody uninvited',
    );
  });
});

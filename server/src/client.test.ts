// The screens call this API through `hono/client`, which reads the types
// straight off `AppType`. That only works while the routes stay chained — one
// route declared on its own line and the client quietly loses the shape of
// everything after it, with no error until something is wrong in a browser.
//
// So this calls the real API the way the frontend does, and checks both that
// the answers are right and that TypeScript knew what they would look like.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { hc } from 'hono/client';
import type { Item, Me } from '../../shared/schemas.ts';
import { app, type AppType } from './app.ts';
import { actAs, closeDb, makeUser, ready, reset } from './test/helpers.ts';

before(ready);
after(closeDb);
beforeEach(reset);

// No network: the client talks to the app object in this process.
const client = hc<AppType>('http://localhost', { fetch: app.request });

describe('the typed client the screens use', () => {
  it('reads a page of items with the types the frontend was built against', async () => {
    const member = await makeUser('member');
    actAs(member);

    const made = await client.api.items.$post({
      json: { title: 'Order the chairs', status: 'open' },
    });
    assert.equal(made.status, 201);
    const created: Item = await made.json();
    assert.equal(created.title, 'Order the chairs');

    const listed = await client.api.items.$get({ query: { limit: '10', status: 'open' } });
    const page = await listed.json();
    const rows: Item[] = page.rows;
    assert.equal(rows.length, 1);
    assert.equal(page.total, 1);
    assert.equal(page.nextCursor, null);

    const one = await client.api.items[':id'].$get({ param: { id: created.id } });
    assert.equal((await one.json()).id, created.id);
  });

  it('knows who is signed in, and can correct the name', async () => {
    const owner = await makeUser('owner', { name: 'The Owner' });
    actAs(owner);
    const me: Me = await (await client.api.me.$get()).json();
    assert.equal(me.name, 'The Owner');
    assert.equal(me.role, 'owner');

    const renamed: Me = await (await client.api.me.$patch({ json: { name: 'The Boss' } })).json();
    assert.equal(renamed.name, 'The Boss');
  });

  it('invites somebody by posting to the list of people', async () => {
    actAs(await makeUser('owner'));
    const invited = await client.api.users.$post({
      json: { email: 'new@example.com', name: 'New Person', role: 'member' },
    });
    assert.equal(invited.status, 201);
    assert.equal((await invited.json()).role, 'member');

    const everybody = await (await client.api.users.$get()).json();
    assert.ok(everybody.some((person) => person.email === 'new@example.com'));
  });
});

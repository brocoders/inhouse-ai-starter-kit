// Files people attach to a record: who may add one, who may read it, and what
// happens to a name somebody chose.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { ApiError, Attachment } from '../../../shared/schemas.ts';
import { app } from '../app.ts';
import { config } from '../config.ts';
import { actAs, closeDb, json, makeUser, ready, reset, type TestUser } from '../test/helpers.ts';

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

async function upload(name: string, contents: string, type = 'text/plain'): Promise<Response> {
  const form = new FormData();
  form.set('entity', 'items');
  form.set('entityId', 'item-1');
  form.set('file', new File([contents], name, { type }));
  return app.request('/api/attachments', {
    method: 'POST',
    body: form,
    headers: { Origin: config.appUrl },
  });
}

describe('attaching a file', () => {
  it('keeps the name and type, and hands it back with the right headers', async () => {
    actAs(member);
    const response = await upload('The Contract.pdf', 'pretend pdf bytes', 'application/pdf');
    assert.equal(response.status, 201);
    const saved = await json<Attachment>(response);
    assert.equal(saved.fileName, 'The Contract.pdf');
    assert.equal(saved.contentType, 'application/pdf');
    assert.equal(saved.size, 'pretend pdf bytes'.length);
    assert.equal(saved.createdBy, member.id);

    actAs(viewer);
    const fetched = await app.request(`/api/attachments/${saved.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.headers.get('content-type'), 'application/pdf');
    assert.equal(fetched.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(fetched.headers.get('cache-control'), 'private, no-store');
    assert.match(
      fetched.headers.get('content-disposition') ?? '',
      /attachment; filename="The Contract.pdf"/,
    );
    assert.equal(await fetched.text(), 'pretend pdf bytes');
  });

  it('stores it under an id of ours, so a name can never become a path', async () => {
    actAs(member);
    const saved = await json<Attachment>(await upload('../../etc/passwd', 'not really'));
    assert.equal(saved.fileName, 'passwd');
    const onDisk = await readdir(config.filesDir);
    assert.ok(onDisk.includes(saved.id));
    assert.equal(
      onDisk.some((name) => name.includes('passwd')),
      false,
    );
  });

  it('lists what is attached to a record', async () => {
    actAs(member);
    await upload('one.txt', 'a');
    await upload('two.txt', 'b');
    actAs(viewer);
    const listed = await json<Attachment[]>(
      await app.request('/api/attachments?entity=items&entityId=item-1'),
    );
    assert.equal(listed.length, 2);
  });

  it('will not take one from a viewer', async () => {
    actAs(viewer);
    const response = await upload('one.txt', 'a');
    assert.equal(response.status, 403);
    assert.equal((await json<ApiError>(response)).kind, 'forbidden');
  });

  it('lets a member or an owner remove one, and takes the file with it', async () => {
    actAs(member);
    const saved = await json<Attachment>(await upload('gone.txt', 'a'));
    actAs(owner);
    const removed = await app.request(`/api/attachments/${saved.id}`, {
      method: 'DELETE',
      headers: { Origin: config.appUrl },
    });
    assert.equal(removed.status, 204);
    assert.equal((await app.request(`/api/attachments/${saved.id}`)).status, 404);
    assert.equal((await readdir(config.filesDir)).includes(saved.id), false);
  });

  it('says plainly when the form did not say which record it is for', async () => {
    actAs(member);
    const form = new FormData();
    form.set('file', new File(['a'], 'one.txt', { type: 'text/plain' }));
    const response = await app.request('/api/attachments', {
      method: 'POST',
      body: form,
      headers: { Origin: config.appUrl },
    });
    assert.equal(response.status, 400);
    assert.ok((await json<ApiError>(response)).fields?.entity);
  });
});

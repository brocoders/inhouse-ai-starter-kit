// The shape of an answer, whatever went wrong, and the way the built screens
// are handed to a browser.
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Hono } from 'hono';
import type { ApiError } from '../../shared/schemas.ts';
import { app, mountFrontend } from './app.ts';
import type { AppEnv } from './auth.ts';
import { actAs, call, closeDb, json, makeUser, ready, reset } from './test/helpers.ts';

before(ready);
after(closeDb);
beforeEach(reset);

describe('every answer that is not a success', () => {
  it('has the same body, and carries the id of the request that caused it', async () => {
    actAs(undefined);
    const response = await call('GET', '/api/items');
    const body = await json<ApiError>(response);
    assert.deepEqual(Object.keys(body).sort(), ['kind', 'message', 'requestId']);
    assert.equal(body.kind, 'auth');
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    // The same id is on the response, so a person can read it off and quote it.
    assert.equal(response.headers.get('x-request-id'), body.requestId);
  });

  it('turns a bad form into a message per field', async () => {
    actAs(await makeUser('member'));
    const response = await call('POST', '/api/items', { title: '' });
    assert.equal(response.status, 400);
    const body = await json<ApiError>(response);
    assert.equal(body.kind, 'validation');
    assert.ok(body.fields?.title, 'the field that was wrong should be named');
  });

  it('answers an unknown address under the API with JSON, not a page', async () => {
    actAs(await makeUser('owner'));
    const response = await call('GET', '/api/nothing-here');
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.equal((await json<ApiError>(response)).kind, 'not_found');
  });
});

describe('the answers a machine reads', () => {
  it('says it is alive, ready, and which release it is', async () => {
    const live = await app.request('/health/live');
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('cache-control'), 'no-store');

    const ready_ = await app.request('/health/ready');
    assert.equal(ready_.status, 200);

    const version = await app.request('/health/version');
    assert.equal(version.status, 200);
    // The release script polls this through the proxy, so a cached answer
    // would have it watching the version it was replacing.
    assert.equal(version.headers.get('cache-control'), 'no-store');
    const body = await json<{ release: string; schemaVersion: number }>(version);
    assert.equal(body.release, 'dev');
    assert.ok(body.schemaVersion >= 1);
  });

  it('answers a mistyped probe with a JSON 404, not the app with a 200', async () => {
    // Mount the screens the way production does, so the fall-through that
    // would turn a typo into a passing check is really there.
    const dir = path.resolve('node_modules/.cache/inhouse-health-fixture');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>The app</title>');
    try {
      const site = new Hono<AppEnv>().route('/', app);
      mountFrontend(site, dir);
      for (const probe of ['/health/nope', '/health/live/extra', '/health/']) {
        const response = await site.request(probe);
        assert.equal(response.status, 404, probe);
        assert.match(response.headers.get('content-type') ?? '', /application\/json/, probe);
        assert.equal((await json<ApiError>(response)).kind, 'not_found', probe);
      }
      assert.equal((await site.request('/health/live')).status, 200);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('needs no sign-in for any of them', async () => {
    actAs(undefined);
    for (const path of ['/health/live', '/health/ready', '/health/version']) {
      assert.equal((await app.request(path)).status, 200, path);
    }
  });
});

describe('the headers every answer carries', () => {
  it('locks the page down and keeps the browser from guessing', async () => {
    const response = await app.request('/health/live');
    assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  });

  it('leaves HSTS to Caddy, which owns the connection', async () => {
    const response = await app.request('/health/live');
    assert.equal(response.headers.get('strict-transport-security'), null);
  });
});

describe('a request from another website', () => {
  it('refuses a form posted from somewhere else, and says so as a refusal', async () => {
    actAs(await makeUser('member'));
    const form = new FormData();
    form.set('entity', 'items');
    form.set('entityId', 'x');
    form.set('file', new File(['a'], 'a.txt', { type: 'text/plain' }));
    const response = await app.request('/api/attachments', {
      method: 'POST',
      body: form,
      headers: { Origin: 'https://somewhere-else.example' },
    });
    assert.equal(response.status, 403);
    const body = await json<ApiError>(response);
    assert.equal(body.kind, 'forbidden');
    assert.match(body.message, /did not come from this app/);
  });

  // A cross-site request carrying JSON is not a form, so a browser asks
  // permission before sending it at all — and this server grants that
  // permission to nobody but itself. The check that matters is the one above:
  // a form is the request a browser will send across sites without asking.
});

describe('handing the built screens to a browser', () => {
  // A stand-in for what `pnpm build` leaves behind: a shell, a hashed bundle,
  // a service worker and a manifest.
  const dir = path.resolve('node_modules/.cache/inhouse-frontend-fixture');
  let site: Hono<AppEnv>;

  before(async () => {
    await mkdir(path.join(dir, 'assets'), { recursive: true });
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>The app</title>');
    await writeFile(path.join(dir, 'assets', 'app-9f3c1b2a.js'), 'console.log(1)');
    await writeFile(path.join(dir, 'sw.js'), '// service worker');
    await writeFile(path.join(dir, 'manifest.webmanifest'), '{"name":"The app"}');
    site = new Hono<AppEnv>();
    site.get('/api/items', (c) => c.json({ rows: [] }));
    mountFrontend(site, dir);
  });
  after(async () => rm(dir, { recursive: true, force: true }));

  it('lets a browser keep a hashed bundle for a year', async () => {
    const response = await site.request('/assets/app-9f3c1b2a.js');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  });

  it('never lets the shell or the service worker be cached', async () => {
    for (const path_ of ['/', '/index.html', '/sw.js', '/manifest.webmanifest']) {
      const response = await site.request(path_);
      assert.equal(response.status, 200, path_);
      assert.equal(response.headers.get('cache-control'), 'no-store', path_);
    }
  });

  it('gives the app itself to any address that is a screen', async () => {
    for (const path_ of ['/items', '/items/abc-123', '/settings/people']) {
      const response = await site.request(path_);
      assert.equal(response.status, 200, path_);
      assert.match(await response.text(), /The app/, path_);
      assert.equal(response.headers.get('cache-control'), 'no-store', path_);
    }
  });

  it('does not mistake the API for a screen', async () => {
    const response = await site.request('/api/items');
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  });
});

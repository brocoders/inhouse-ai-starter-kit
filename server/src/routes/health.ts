// Three small answers for machines, and one long one for the owner.
//
// `/health/live`   — the process is up. Always 200; if it does not answer, it
//                    is not running.
// `/health/ready`  — it can reach its database and serve a request. The
//                    release script waits for this before switching over.
// `/health/version` — which release is answering, so the release script can
//                    tell the new container from the old one through the
//                    proxy. Unauthenticated and never cached, or it would
//                    report the version that was there a minute ago.
import { Hono } from 'hono';
import type { ApiError } from '../../../shared/schemas.ts';
import type { AppEnv } from '../auth.ts';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { schemaVersion } from '../db/migrate.ts';
import { isReady } from '../ops.ts';

export const healthRoutes = new Hono<AppEnv>()
  .get('/live', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'live' });
  })
  .get('/ready', async (c) => {
    c.header('Cache-Control', 'no-store');
    const ready = await isReady();
    return c.json({ status: ready ? 'ready' : 'not ready' }, ready ? 200 : 503);
  })
  .get('/version', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      release: config.release,
      schemaVersion: await schemaVersion(db).catch(() => 0),
    });
  })
  // Anything else under /health is a probe with a typo in it. Left to fall
  // through, it would reach the screens and come back 200 with a page of
  // HTML — so a mistyped health check would pass for ever and prove nothing.
  .all('*', (c) => {
    c.header('Cache-Control', 'no-store');
    const body: ApiError = {
      kind: 'not_found',
      message: 'There is no health check at that address.',
      requestId: c.get('requestId'),
    };
    return c.json(body, 404);
  });

// The whole HTTP surface, assembled.
//
// One origin serves everything: the built screens at the root, the API under
// `/api`, the health answers under `/health`. That is what makes the session
// cookie a plain first-party cookie with no CORS to configure — in
// development Vite proxies `/api` to this process so the arrangement is the
// same there.
//
// The routes are chained rather than declared one at a time because that is
// how `hono/client` learns their types: the frontend calls this API through
// `AppType` and finds out at compile time when a shape changes.
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import type { ApiError } from '../../shared/schemas.ts';
import { auth, requireRole, requireUser, type AppEnv } from './auth.ts';
import { config } from './config.ts';
import { AppError, statusForKind } from './errors.ts';
import { log } from './log.ts';
import { opsStatus } from './ops.ts';
import { MAX_UPLOAD_BYTES, attachmentsRoutes } from './routes/attachments.ts';
import { auditRoutes } from './routes/audit.ts';
import { healthRoutes } from './routes/health.ts';
import { itemsRoutes } from './routes/items.ts';
import { usersRoutes } from './routes/users.ts';

/** Where `pnpm build` leaves the screens. Absent during `pnpm dev`. */
export const frontendDir = path.resolve('dist/frontend');

const api = new Hono<AppEnv>()
  .use('*', requireUser)
  .route('/items', itemsRoutes)
  .route('/audit', auditRoutes)
  .route('/attachments', attachmentsRoutes)
  .route('/', usersRoutes)
  .get('/ops', requireRole('owner'), async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await opsStatus());
  });

export const app = new Hono<AppEnv>()
  .use('*', requestId())
  .use('*', async (c, next) => {
    // Everything this request logs carries its id, so one line and the error
    // beside it belong together without reading timestamps.
    c.set('log', log.child({ requestId: c.get('requestId') }));
    const started = Date.now();
    try {
      await next();
    } finally {
      // The route pattern, never the URL: a URL carries what somebody typed.
      log.info(
        {
          method: c.req.method,
          route: c.req.routePath,
          status: c.res.status,
          durationMs: Date.now() - started,
          requestId: c.get('requestId'),
          userId: c.get('user')?.id ?? null,
        },
        'request',
      );
    }
  })
  .use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
      strictTransportSecurity: config.isProduction ? 'max-age=31536000; includeSubDomains' : false,
    }),
  )
  // Nothing on this server is ever bigger than a file upload.
  .use('*', bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: () => { throw new AppError('validation', 'That was too large to send.'); } }))
  // In development the screens run on Vite's own port, so they are a different
  // origin and need permission to send the session cookie. In production they
  // are served from here and this does nothing.
  .use('*', async (c, next) => {
    if (config.isProduction) return next();
    return cors({ origin: config.appUrl, credentials: true })(c, next);
  })
  // A form on another site cannot make a signed-in browser change anything
  // here: a mutation must come from our own origin.
  .use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    return csrf({ origin: (origin) => origin === config.appUrl })(c, next);
  })
  .route('/health', healthRoutes)
  .all('/api/auth/*', (c) => auth.handler(c.req.raw))
  .route('/api', api)
  // An unknown path under /api is a mistake in the caller, not a page.
  .all('/api/*', (c) => {
    const body: ApiError = {
      kind: 'not_found',
      message: 'There is nothing at that address.',
      requestId: c.get('requestId'),
    };
    return c.json(body, 404);
  })
  .onError((error, c) => {
    const requestId = c.get('requestId');
    if (error instanceof AppError) {
      const body: ApiError = {
        kind: error.kind,
        message: error.message,
        requestId,
        ...(error.fields ? { fields: error.fields } : {}),
      };
      return c.json(body, statusForKind(error.kind));
    }
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) fields[issue.path.join('.') || 'body'] = issue.message;
      const body: ApiError = {
        kind: 'validation',
        message: 'Some of what you sent is not usable.',
        requestId,
        fields,
      };
      return c.json(body, 400);
    }
    // Anything else is a bug. The person gets a sentence; the stack goes to
    // the log, where the request id ties it to the line above.
    log.error({ requestId, err: error }, error instanceof Error ? error.message : String(error));
    const body: ApiError = {
      kind: 'permanent',
      message: 'Something went wrong at our end. It has been written down.',
      requestId,
    };
    return c.json(body, 500);
  });

// The built screens, when they exist. A fresh clone has no `dist/frontend`
// and this whole section is skipped, which is why `pnpm dev:server` works on
// its own.
if (existsSync(frontendDir)) {
  const noStore = new Set(['/index.html', '/sw.js', '/manifest.webmanifest', '/registerSW.js']);

  app.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/assets/')) {
      // The bundler put a hash in the name, so this exact file never changes.
      c.header('Cache-Control', 'private, max-age=31536000, immutable');
    } else if (noStore.has(c.req.path) || c.req.path === '/') {
      // The shell and the service worker decide whether there is a new
      // release, so they must never come from a cache.
      c.header('Cache-Control', 'no-store');
    }
  });
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), frontendDir) }));
  // Anything else that a browser asked for as a page is the app itself: the
  // router in the browser works out which screen it is.
  app.get('*', serveStatic({ path: path.join(path.relative(process.cwd(), frontendDir), 'index.html') }));
}

export type AppType = typeof app;

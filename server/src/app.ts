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
import { HTTPException } from 'hono/http-exception';
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
      // Caddy sets HSTS (see the Caddyfile): it is about the connection, which
      // is Caddy's half of the job. Setting it here as well would be one header
      // written in two places, and the day they disagree a browser keeps
      // whichever it saw last.
      strictTransportSecurity: false,
    }),
  )
  // Nothing on this server is ever bigger than a file upload.
  .use(
    '*',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: () => {
        throw new AppError('validation', 'That was too large to send.');
      },
    }),
  )
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
    // Hono's own middleware refuses some requests by throwing — a form posted
    // from another website is the one that matters here. That is a refusal,
    // not a crash, so it keeps its status instead of being reported as a
    // fault at our end.
    if (error instanceof HTTPException) {
      const body: ApiError = {
        kind:
          error.status === 403 ? 'forbidden' : error.status === 404 ? 'not_found' : 'validation',
        message:
          error.status === 403
            ? 'That request did not come from this app, so it was refused.'
            : error.message || 'That request could not be accepted.',
        requestId,
      };
      return c.json(body, error.status);
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

/**
 * Hand the built screens to a browser.
 *
 * Two cache rules, and they matter more than they look. A file under
 * `/assets/` has a hash of its own contents in its name, so that exact file
 * can never change and the browser may keep it for a year — which is what
 * makes a second visit instant. The shell, the service worker and the
 * manifest are the opposite: they are how a browser finds out that a new
 * release exists, so a cached copy would leave somebody on last week's app
 * with no way to notice.
 *
 * Anything else that a browser asked for as a page gets the shell, and the
 * router inside it works out which screen that address means. `/api` and
 * `/health` are matched before this, so they are never mistaken for a screen.
 */
export function mountFrontend(target: Hono<AppEnv>, dir: string): void {
  const root = path.relative(process.cwd(), dir);
  const noStore = new Set([
    '/index.html',
    '/sw.js',
    '/manifest.webmanifest',
    '/registerSW.js',
    '/',
  ]);

  target.use('/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/assets/')) {
      c.header('Cache-Control', 'private, max-age=31536000, immutable');
    } else if (noStore.has(c.req.path)) {
      c.header('Cache-Control', 'no-store');
    }
  });
  target.use('/*', serveStatic({ root }));
  const shell = serveStatic({ path: path.join(root, 'index.html') });
  target.get('*', async (c, next) => {
    const response = await shell(c, next);
    if (response instanceof Response) response.headers.set('Cache-Control', 'no-store');
    return response;
  });
}

// A fresh clone has no `dist/frontend`, and then none of this is mounted —
// which is why `pnpm dev:server` runs on its own while Vite serves the screens.
if (existsSync(frontendDir)) mountFrontend(app, frontendDir);

export type AppType = typeof app;

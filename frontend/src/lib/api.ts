// The only way the screens talk to the server.
//
// Two things are worth the few lines here. Every answer is parsed with the
// schema from shared/schemas.ts, so a server that quietly changes a field
// fails loudly at the boundary instead of rendering "undefined" three screens
// away. And every failure arrives as the same typed error, so a screen shows
// the server's own sentence rather than inventing one.
import { z } from 'zod';
import { ApiError as ApiErrorBody, type ApiError as ApiErrorShape } from '@shared/schemas';
import { clearCache } from './query';

export class ApiError extends Error {
  readonly kind: ApiErrorShape['kind'];
  readonly requestId: string;
  readonly fields: Record<string, string> | undefined;
  readonly status: number;
  constructor(body: ApiErrorShape, status: number) {
    super(body.message);
    this.name = 'ApiError';
    this.kind = body.kind;
    this.requestId = body.requestId;
    this.fields = body.fields;
    this.status = status;
  }
}

/**
 * What to do when the server says the session is gone. The shell registers a
 * router navigation; until it does, the browser's own is the fallback, because
 * a person staring at an empty screen is worse than a full page load.
 */
let onSessionLost: () => void = () => {
  if (window.location.pathname !== '/sign-in') window.location.assign('/sign-in');
};
export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

function withParams(path: string, params?: QueryParams): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(
  method: string,
  path: string,
  schema: z.ZodType<T>,
  options: { params?: QueryParams; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(withParams(path, options.params), {
      method,
      // The session is a cookie on this same origin; in development Vite
      // proxies /api so it stays that way.
      credentials: 'same-origin',
      headers:
        options.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    // No answer at all: offline, or the server is restarting mid-release.
    throw new ApiError(
      {
        kind: 'transient',
        message: 'The server did not answer. Check the connection.',
        requestId: '',
      },
      0,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const parsed = ApiErrorBody.safeParse(body);
    const error = parsed.success
      ? new ApiError(parsed.data, response.status)
      : new ApiError(
          {
            kind: response.status >= 500 ? 'transient' : 'permanent',
            message: `The server answered ${response.status}.`,
            requestId: '',
          },
          response.status,
        );
    if (error.kind === 'auth') {
      // The session went while the app was open. Nothing in the cache belongs
      // to anyone now, so it goes before the sign-in screen appears.
      clearCache();
      onSessionLost();
    }
    throw error;
  }

  if (response.status === 204) return schema.parse(undefined);
  const data = await response.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiError(
      {
        kind: 'permanent',
        message: 'The server sent something this version cannot read.',
        requestId: '',
      },
      response.status,
    );
  return parsed.data;
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>, params?: QueryParams, signal?: AbortSignal) =>
    request('GET', path, schema, { ...(params ? { params } : {}), ...(signal ? { signal } : {}) }),
  post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('POST', path, schema, { body: body ?? {} }),
  patch: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request('PATCH', path, schema, { body: body ?? {} }),
  delete: <T>(path: string, schema: z.ZodType<T>) => request('DELETE', path, schema, {}),
};

/** The field messages a form shows under its inputs, if the server sent any. */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {};
}

/** The one sentence to show a person when something failed. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

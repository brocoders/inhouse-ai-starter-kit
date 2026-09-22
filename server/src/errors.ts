// One vocabulary for everything that can go wrong, shared with the screens
// through `ApiError.kind`. Code throws an `AppError` with the kind and a
// sentence a person can read; the server turns it into the response body and
// the status code. Anything else that escapes is a bug: it becomes a generic
// "permanent" answer and the stack goes to the log, never to the browser.
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '../../shared/schemas.ts';

export type ErrorKind = ApiError['kind'];

const STATUS: Record<ErrorKind, ContentfulStatusCode> = {
  validation: 400,
  auth: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  transient: 503,
  permanent: 500,
};

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly fields: Record<string, string> | undefined;

  constructor(kind: ErrorKind, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.fields = fields;
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.kind];
  }
}

export const statusForKind = (kind: ErrorKind): ContentfulStatusCode => STATUS[kind];

export const notFound = (what: string) => new AppError('not_found', `${what} was not found.`);
export const forbidden = (why: string) => new AppError('forbidden', why);
export const unauthenticated = () => new AppError('auth', 'You need to sign in to do that.');

/**
 * What to do when something arriving from outside does not match its schema.
 *
 * `zValidator` answers with its own body by default, which would be the one
 * response in the app that does not look like all the others. Passing this as
 * its hook makes a bad form come back in the same shape as everything else,
 * with a message for each field the screen can put next to the input.
 */
export function orFail(result: { success: boolean; error?: unknown }): void {
  if (result.success) return;
  const issues =
    (result.error as { issues?: { path: PropertyKey[]; message: string }[] })?.issues ?? [];
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path.map(String).join('.') || 'body'] = issue.message;
  throw new AppError('validation', 'Some of what you sent is not usable.', fields);
}

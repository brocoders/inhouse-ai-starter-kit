// One vocabulary for everything that can go wrong, shared with the screens
// through `ApiError.kind`. Code throws an `AppError` with the kind and a
// sentence a person can read; the server turns it into the response body and
// the status code. Anything else that escapes is a bug: it becomes a generic
// "permanent" answer and the stack goes to the log, never to the browser.
import type { ApiError } from '../../shared/schemas.ts';

export type ErrorKind = ApiError['kind'];

const STATUS: Record<ErrorKind, number> = {
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

  get status(): number {
    return STATUS[this.kind];
  }
}

export const statusForKind = (kind: ErrorKind): number => STATUS[kind];

export const notFound = (what: string) => new AppError('not_found', `${what} was not found.`);
export const forbidden = (why: string) => new AppError('forbidden', why);
export const unauthenticated = () => new AppError('auth', 'You need to sign in to do that.');

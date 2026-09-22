// Structured logs, one JSON object per line, on standard output — journald on
// the server keeps them for thirty days and nothing is shipped anywhere else.
// Every line carries the release, so a log read a week later says which
// version produced it.
//
// What must never appear here: query strings, request bodies, e-mail
// addresses, file names, anything a person typed. A request is identified by
// its route pattern and its request id, and a user by their id.
import pino from 'pino';
import { config } from './config.ts';

export type RecentError = { at: string; requestId: string | null; message: string; count: number };

// The health page shows the last errors so the owner can see a problem without
// an SSH session. A hundred is enough to cover a bad hour and small enough to
// hold forever.
const RING_SIZE = 100;
const ring: { at: string; requestId: string | null; message: string }[] = [];

export function recordError(message: string, requestId: string | null): void {
  ring.push({ at: new Date().toISOString(), requestId, message: message.slice(0, 300) });
  if (ring.length > RING_SIZE) ring.shift();
}

/** Newest first, one entry per distinct message with how often it happened. */
export function recentErrors(): RecentError[] {
  const grouped = new Map<string, RecentError>();
  for (const entry of ring) {
    const seen = grouped.get(entry.message);
    if (seen) {
      seen.count += 1;
      seen.at = entry.at;
      seen.requestId = entry.requestId;
    } else {
      grouped.set(entry.message, { ...entry, count: 1 });
    }
  }
  return [...grouped.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export function clearRecentErrors(): void {
  ring.length = 0;
}

// A test run throws the lines away rather than turning the logger off. Pino
// skips a level it is not going to print, hook and all, so silencing it would
// also empty the list of recent errors the health page reads — and that list
// is one of the things the tests are here to check.
const destination: pino.DestinationStream = config.isTest
  ? { write: () => {} }
  : pino.destination(process.stdout.fd);

export const log = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { release: config.release },
    timestamp: pino.stdTimeFunctions.isoTime,
    hooks: {
      // Anything logged at error level is also a candidate for the health
      // page, so there is one place to call and not two.
      logMethod(args, method, level) {
        if (level >= 50) {
          const [first, second] = args as [unknown, unknown];
          const context = (typeof first === 'object' && first !== null ? first : {}) as {
            requestId?: string;
            err?: { message?: string };
          };
          const message =
            typeof first === 'string'
              ? first
              : typeof second === 'string'
                ? second
                : (context.err?.message ?? 'error');
          recordError(message, context.requestId ?? null);
        }
        return method.apply(this, args as Parameters<typeof method>);
      },
    },
  },
  destination,
);

export type Log = typeof log;

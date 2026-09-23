// Everything the server needs to know about where it is running. Read once,
// validated once, and if anything is missing the process stops immediately
// with a sentence the person who deployed it can act on — a server that starts
// half-configured fails later, in the dark, in front of a user.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const timeZone = z.string().refine(isKnownTimeZone, {
  message: 'is not a time zone name the system knows, e.g. Europe/Berlin or UTC',
});

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  DATA_DIR: z.string().min(1).default('data/dev'),
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('InHouse <no-reply@localhost>'),
  APP_NAME: z.string().min(1).default('InHouse'),
  APP_TIME_ZONE: timeZone.default('UTC'),
  APP_LOCALE: z.string().min(2).default('en-US'),
  APP_RELEASE: z.string().min(1).default('dev'),
  BACKUP_DIR: z.string().min(1).optional(),
  DEV_AUTO_SIGN_IN_EMAIL: z.email().optional(),
  WORKER: z.enum(['on', 'off']).default('on'),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  databaseUrl: string | undefined;
  dataDir: string;
  filesDir: string;
  outboxDir: string;
  authSecret: string;
  resendApiKey: string | undefined;
  emailFrom: string;
  appName: string;
  timeZone: string;
  locale: string;
  release: string;
  backupDir: string | undefined;
  devAutoSignInEmail: string | undefined;
  worker: boolean;
};

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// In development nobody should have to invent a secret before the app will
// start, so we make one and keep it. Losing it only signs everyone out.
function developmentSecret(dataDir: string): string {
  const file = path.join(dataDir, 'auth-secret');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 16) return existing;
  } catch {
    // No secret yet; fall through and write one.
  }
  const secret = randomBytes(32).toString('base64url');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, secret + '\n', { mode: 0o600 });
  return secret;
}

/**
 * A test run gets a world of its own.
 *
 * `node --test` sets `NODE_TEST_CONTEXT` in every test process, and reacting
 * to it here rather than in a test helper is what makes it reliable: settings
 * are read the moment something imports this file, which can happen before
 * any helper has had a chance to run. A test must never write into the folder
 * somebody is developing in — it would replace their database and their
 * outbox — and must never reach a real PostgreSQL or send real e-mail because
 * a stale variable was left in the shell.
 */
function forTests(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'inhouse-test-'));
  const { DATABASE_URL, RESEND_API_KEY, BACKUP_DIR, DEV_AUTO_SIGN_IN_EMAIL, ...rest } = env;
  return {
    ...rest,
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    // The one test file that wants a real PostgreSQL says so deliberately, by
    // setting TEST_DATABASE_OPT_IN in its own process before it imports this
    // module. CI sets TEST_POSTGRES and TEST_DATABASE_URL for the whole run,
    // and without the opt-in every test file would share that one database
    // while running two at a time — the first CI run failed on exactly that,
    // with concurrent migrations tripping over each other. Every other file
    // keeps its private in-memory PGlite.
    ...(env.TEST_POSTGRES === '1' && env.TEST_DATABASE_URL && env.TEST_DATABASE_OPT_IN === '1'
      ? { DATABASE_URL: env.TEST_DATABASE_URL }
      : {}),
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = source.NODE_TEST_CONTEXT === undefined ? source : forTests(source);
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`The settings in your .env file are not usable yet:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProduction && !e.BETTER_AUTH_SECRET) {
    problems.push(
      'BETTER_AUTH_SECRET is missing. Sessions are signed with it; without one nobody could stay signed in across a restart. Generate a long random string and put it in .env.',
    );
  }
  if (isProduction && e.DEV_AUTO_SIGN_IN_EMAIL) {
    problems.push(
      'DEV_AUTO_SIGN_IN_EMAIL is set. That setting lets anyone in without signing in and exists only for development. Remove it before running in production.',
    );
  }
  if (e.RESEND_API_KEY && !source.EMAIL_FROM) {
    problems.push(
      'RESEND_API_KEY is set but EMAIL_FROM is not. Resend refuses mail from an address you have not verified, so set EMAIL_FROM to an address on your own domain.',
    );
  }
  if (problems.length) throw new Error(`This server cannot start:\n\n- ${problems.join('\n\n- ')}`);

  const dataDir = path.resolve(e.DATA_DIR);
  const authSecret = e.BETTER_AUTH_SECRET ?? developmentSecret(dataDir);

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    databaseUrl: e.DATABASE_URL,
    dataDir,
    filesDir: path.join(dataDir, 'files'),
    outboxDir: path.join(dataDir, 'outbox'),
    authSecret,
    resendApiKey: e.RESEND_API_KEY,
    emailFrom: e.EMAIL_FROM,
    appName: e.APP_NAME,
    timeZone: e.APP_TIME_ZONE,
    locale: e.APP_LOCALE,
    release: e.APP_RELEASE,
    backupDir: e.BACKUP_DIR,
    devAutoSignInEmail: isProduction ? undefined : e.DEV_AUTO_SIGN_IN_EMAIL,
    worker: e.WORKER === 'on',
  };
}

export const config: Config = loadConfig();

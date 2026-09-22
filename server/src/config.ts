// Everything the server needs to know about where it is running. Read once,
// validated once, and if anything is missing the process stops immediately
// with a sentence the person who deployed it can act on — a server that starts
// half-configured fails later, in the dark, in front of a user.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
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
  if (e.RESEND_API_KEY && !env.EMAIL_FROM) {
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

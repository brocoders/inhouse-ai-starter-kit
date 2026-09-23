// Who is allowed in, and what they may do.
//
// There is no public sign-up. An owner invites somebody by e-mail; that
// creates their row and sends them a link that signs them in. From then on
// they can sign in with the same link by e-mail, or set a password.
//
// Roles are a column on the user row plus the middleware below — not a
// plugin. owner ⊃ member ⊃ viewer: an owner may do anything a member may, a
// member anything a viewer may.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { Role } from '../../shared/schemas.ts';
import { config } from './config.ts';
import { db } from './db/index.ts';
import { schema, user } from './db/schema.ts';
import { AppError } from './errors.ts';
import { notify } from './notify/index.ts';

export type SignedInUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  locale: string;
  timeZone: string;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type AppEnv = {
  Variables: {
    user: SignedInUser;
    requestId: string;
    log: import('./log.ts').Log;
  };
};

export const auth = betterAuth({
  appName: config.appName,
  baseURL: config.appUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  // The API and the screens share an origin in production (Caddy puts the app
  // behind one host), so the session cookie is a plain first-party cookie.
  trustedOrigins: [config.appUrl],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Without this, `/api/auth/sign-up/email` would be open to the world and
    // "invitation only" would be a comment rather than a rule. People get an
    // account when an owner invites them and no other way; a password is
    // something they add afterwards.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // `input: false` keeps these out of anything a signing-up person can
      // send: nobody makes themselves an owner by posting a role.
      role: { type: 'string', required: false, defaultValue: 'member', input: false },
      active: { type: 'boolean', required: false, defaultValue: true, input: false },
      locale: { type: 'string', required: false, input: false },
      timeZone: { type: 'string', required: false, input: false },
      lastSeenAt: { type: 'date', required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // a week
    updateAge: 60 * 60 * 24, // and a week again after any day of use
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
    },
    // The rate limit below counts per address, and the address is all Better
    // Auth has to go on: behind Caddy the connection always comes from Caddy,
    // so without a header every person on earth would share one budget of
    // three sign-in attempts. Caddy sets `X-Forwarded-For` to the one address
    // it saw and throws away whatever the browser sent in that header, and the
    // app's port is not published, so a single-value header here is the
    // client's real address. `trustedProxies` stays unset on purpose: with it
    // unset Better Auth accepts only a single-value header, so a forged chain
    // resolves to no address rather than to the one the forger chose. In
    // development Vite adds no header and every request counts as 127.0.0.1,
    // which for one person at one machine is the truth.
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
    },
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      // Guessing a password is the attack this stops.
      '/sign-in/email': { window: 10, max: 3 },
      '/sign-in/magic-link': { window: 10, max: 3 },
    },
  },
  plugins: [
    magicLink({
      // Invitation only: a link for an address with no user row does nothing.
      disableSignUp: true,
      expiresIn: 60 * 60, // an hour is long enough to find the mail
      async sendMagicLink({ email, url }) {
        // `disableSignUp` stops the plugin creating an account, but it only
        // checks that when the link is opened — the request to send one is
        // answered for any address at all. Left alone, a stranger could use
        // this app to post mail to anybody. So nothing is sent unless the
        // address already belongs to somebody here. The caller gets the same
        // answer either way, which is also how it should be: it must not
        // become a way to find out who has an account.
        const [known] = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email))
          .limit(1);
        if (!known) return;
        await notify({
          email,
          subject: `Sign in to ${config.appName}`,
          text: [
            `Open this link to sign in to ${config.appName}:`,
            '',
            url,
            '',
            'The link works once and expires in an hour. If you did not ask for it, ignore this message.',
          ].join('\n'),
        });
      },
    }),
  ],
});

export type Auth = typeof auth;

const ROLE_RANK: Record<Role, number> = { viewer: 1, member: 2, owner: 3 };

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

function toSignedInUser(row: typeof user.$inferSelect): SignedInUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: Role.catch('member').parse(row.role),
    active: row.active ?? true,
    locale: row.locale ?? config.locale,
    timeZone: row.timeZone ?? config.timeZone,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

async function userByEmail(email: string): Promise<SignedInUser | undefined> {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return row ? toSignedInUser(row) : undefined;
}

async function userById(id: string): Promise<SignedInUser | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row ? toSignedInUser(row) : undefined;
}

/**
 * Who is making this request, or nobody.
 *
 * In development `DEV_AUTO_SIGN_IN_EMAIL` stands in for a session, so the
 * screenshot script and a fresh clone can call the API without a sign-in
 * round trip. The settings refuse to load that variable in production.
 */
export async function currentUser(c: Context): Promise<SignedInUser | undefined> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user?.id) return userById(session.user.id);
  if (config.devAutoSignInEmail) return userByEmail(config.devAutoSignInEmail);
  return undefined;
}

// A person's last visit is worth a column but not a write on every request.
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const signedIn = await currentUser(c);
  if (!signedIn) throw new AppError('auth', 'You need to sign in to do that.');
  if (!signedIn.active) {
    throw new AppError(
      'forbidden',
      'This account has been turned off. Ask an owner to turn it back on.',
    );
  }
  c.set('user', signedIn);
  const since = signedIn.lastSeenAt ? Date.now() - signedIn.lastSeenAt.getTime() : Infinity;
  if (since > LAST_SEEN_EVERY_MS) {
    await db.update(user).set({ lastSeenAt: new Date() }).where(eq(user.id, signedIn.id));
  }
  await next();
};

const WHO_MAY: Record<Role, string> = {
  owner: 'an owner',
  member: 'a member or an owner',
  viewer: 'somebody who is signed in',
};

export function requireRole(required: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const signedIn = c.get('user');
    if (!signedIn) throw new AppError('auth', 'You need to sign in to do that.');
    if (!hasRole(signedIn.role, required)) {
      throw new AppError('forbidden', `Only ${WHO_MAY[required]} can do that.`);
    }
    await next();
  };
}

// The people who may use this app, and how they get in.
//
// The invitation flow, end to end:
//   1. An owner posts an address, a name and a role to `/api/users/invite`.
//   2. We create the user row ourselves — active, with a role and no password.
//   3. We ask Better Auth for a magic link for that address. The magic-link
//      plugin is configured with `disableSignUp: true`, so the link only ever
//      works for an address that already has a row: step 2 is what turns an
//      invitation into an account, and a link sent to anybody else is inert.
//   4. `sendMagicLink` hands the message to `notify()`, which sends it through
//      Resend or, with no key configured, writes it to `DATA_DIR/outbox/`.
//   5. Opening the link signs them in. They can set a password afterwards, or
//      keep asking for a link.
import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { InviteInput, Role, UpdateUserInput, type Me, type User } from '../../../shared/schemas.ts';
import { auth, requireRole, type AppEnv } from '../auth.ts';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { recordChange } from '../db/audit.ts';
import { user } from '../db/schema.ts';
import { AppError, notFound } from '../errors.ts';

const iso = (at: Date | null): string | null => (at ? at.toISOString() : null);

export function toUser(row: typeof user.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: Role.catch('member').parse(row.role),
    active: row.active ?? true,
    lastSeenAt: iso(row.lastSeenAt),
    createdAt: row.createdAt.toISOString(),
  };
}

async function activeOwnersOtherThan(id: string): Promise<number> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'owner'), eq(user.active, true), ne(user.id, id)));
  return rows.length;
}

export const usersRoutes = new Hono<AppEnv>()
  .get('/me', (c) => {
    const signedIn = c.get('user');
    const me: Me = {
      id: signedIn.id,
      name: signedIn.name,
      email: signedIn.email,
      role: signedIn.role,
      active: signedIn.active,
      lastSeenAt: iso(signedIn.lastSeenAt),
      createdAt: signedIn.createdAt.toISOString(),
      locale: signedIn.locale,
      timeZone: signedIn.timeZone,
    };
    return c.json(me);
  })
  .get('/users', requireRole('member'), async (c) => {
    const rows = await db.select().from(user).orderBy(asc(user.name));
    return c.json(rows.map(toUser));
  })
  .post('/users/invite', requireRole('owner'), zValidator('json', InviteInput), async (c) => {
    const input = c.req.valid('json');
    const email = input.email.toLowerCase();
    const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (existing) {
      throw new AppError('conflict', 'Somebody with that e-mail address is already on the list.', {
        email: 'already invited',
      });
    }

    const now = new Date();
    const row: typeof user.$inferInsert = {
      id: randomUUID(),
      name: input.name,
      email,
      emailVerified: false,
      role: input.role,
      active: true,
      locale: config.locale,
      timeZone: config.timeZone,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(user).values(row);
    const [created] = await db.select().from(user).where(eq(user.id, row.id)).limit(1);
    if (!created) throw notFound('The person you just invited');

    await recordChange(db, {
      actorId: c.get('user').id,
      entity: 'user',
      entityId: created.id,
      action: 'created',
      after: toUser(created),
    });

    // Better Auth mints the token, stores it and calls our `sendMagicLink`.
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/' },
      headers: c.req.raw.headers,
    });

    return c.json(toUser(created), 201);
  })
  .patch(
    '/users/:id',
    requireRole('owner'),
    zValidator('param', z.object({ id: z.string().min(1) })),
    zValidator('json', UpdateUserInput),
    async (c) => {
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const [before] = await db.select().from(user).where(eq(user.id, id)).limit(1);
      if (!before) throw notFound('That person');

      // An app with nobody who can change anything is an app nobody can fix.
      const losingAnOwner =
        (before.role === 'owner' && before.active === true) &&
        ((input.role !== undefined && input.role !== 'owner') || input.active === false);
      if (losingAnOwner && (await activeOwnersOtherThan(id)) === 0) {
        throw new AppError(
          'validation',
          'This is the last owner. Make somebody else an owner first, otherwise nobody could manage the app.',
          { role: 'the last owner must stay an owner' },
        );
      }

      await db
        .update(user)
        .set({
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, id));
      const [after] = await db.select().from(user).where(eq(user.id, id)).limit(1);
      if (!after) throw notFound('That person');

      await recordChange(db, {
        actorId: c.get('user').id,
        entity: 'user',
        entityId: id,
        action: 'updated',
        before: toUser(before),
        after: toUser(after),
      });
      return c.json(toUser(after));
    },
  );

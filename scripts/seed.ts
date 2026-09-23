// The first person, and something to look at.
//
//   node scripts/seed.ts --owner you@example.com "Your Name"
//   node scripts/seed.ts --owner you@example.com "Your Name" --sample
//
// It refuses to run with NODE_ENV=production unless `--i-mean-production` is
// passed as well: on the live database it would hand the owner's keys to
// whichever address was typed, and a script run in the wrong terminal is the
// usual way that happens.
//
// The owner is the account that can invite everybody else. With no Resend key
// configured the sign-in link is printed here, so the first screen is one
// command away from a fresh clone. `--sample` adds about forty items of the
// worked example so the lists, filters and paging have something in them.
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { auth } from '../server/src/auth.ts';
import { config } from '../server/src/config.ts';
import { recordChange } from '../server/src/db/audit.ts';
import { handle, db } from '../server/src/db/index.ts';
import { migrateDb } from '../server/src/db/migrate.ts';
import { items, user } from '../server/src/db/schema.ts';
import { lastOutboxMessage } from '../server/src/notify/email.ts';
import { addDays, calendarDay } from '../server/src/time.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
};

const ownerEmail = flag('--owner');
const ownerName = ownerEmail ? (argv[argv.indexOf('--owner') + 2] ?? 'Owner') : 'Owner';
const withSample = argv.includes('--sample');

if (config.isProduction && !argv.includes('--i-mean-production')) {
  process.stderr.write(
    'NODE_ENV is production, so this would change the live list of people.\n' +
      'If that is what you want, run it again with --i-mean-production.\n',
  );
  process.exit(1);
}

if (!ownerEmail) {
  process.stderr.write(
    'Say who the owner is:\n\n  node scripts/seed.ts --owner you@example.com "Your Name" [--sample]\n\n',
  );
  process.exit(1);
}

await migrateDb(handle);

const email = ownerEmail.toLowerCase();
const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
let ownerId = existing?.id;

if (existing) {
  // Already there — make sure they are an owner and can get in. That is a
  // change to who may do what, so it leaves a line in the history like any
  // other: no actor, because nobody signed in made it.
  const before = { role: existing.role, active: existing.active };
  const after = { role: 'owner', active: true };
  if (before.role !== after.role || before.active !== after.active) {
    await db
      .update(user)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(user.id, existing.id));
    await recordChange(db, {
      actorId: null,
      entity: 'user',
      entityId: existing.id,
      action: 'updated',
      before,
      after,
    });
  }
  process.stdout.write(`${email} was already on the list; they are an owner again.\n`);
} else {
  ownerId = randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id: ownerId,
    name: ownerName,
    email,
    emailVerified: true,
    role: 'owner',
    active: true,
    locale: config.locale,
    timeZone: config.timeZone,
    createdAt: now,
    updatedAt: now,
  });
  process.stdout.write(`${ownerName} <${email}> is now the owner.\n`);
}

if (withSample) {
  const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(items);
  if (Number(counted?.total ?? 0) > 0) {
    process.stdout.write('There are already items here, so no samples were added.\n');
  } else {
    const today = calendarDay();
    const titles = [
      'Renew the office insurance',
      'Chase the November invoice from Delta Ltd',
      'Book the team lunch',
      'Order replacement laptop chargers',
      'Write the quarterly update for the board',
      'Review the supplier contract',
      'Fix the printer on the second floor',
      'Update the price list on the website',
      'Call the accountant about the VAT return',
      'Arrange the annual fire check',
      'Approve the new starter paperwork',
      'Cancel the unused software subscription',
      'Send the customer satisfaction survey',
      'Plan the winter shutdown rota',
      'Photograph the new stock for the catalogue',
      'Refund the duplicate payment to Marks & Co',
      'Sort out the recycling contract',
      'Move the shared drive to the new folder layout',
      'Interview the two shortlisted candidates',
      'Replace the broken chair in reception',
    ];
    const rows: (typeof items.$inferInsert)[] = [];
    for (let i = 0; i < 42; i++) {
      // Spread them over the past six weeks so the list has depth to page
      // through and the dates are not all the same.
      const createdAt = new Date(Date.now() - i * 8 * 3_600_000 - (i % 5) * 900_000);
      const dueOffset = [-9, -3, -1, 0, 2, 5, 11, 25][i % 8] ?? 0;
      rows.push({
        id: randomUUID(),
        title: `${titles[i % titles.length]}${i >= titles.length ? ` (${Math.floor(i / titles.length) + 1})` : ''}`,
        notes: i % 3 === 0 ? 'Left over from the last review. Worth ten minutes.' : null,
        status: i % 4 === 0 ? 'done' : 'open',
        dueOn: i % 7 === 0 ? null : addDays(today, dueOffset),
        assigneeId: i % 3 === 0 ? (ownerId ?? null) : null,
        createdAt,
        updatedAt: createdAt,
        createdBy: ownerId ?? null,
        updatedBy: ownerId ?? null,
      });
    }
    await db.insert(items).values(rows);
    process.stdout.write(`${rows.length} sample items added.\n`);
  }
}

// A link to get in with. With a Resend key this goes to their inbox instead.
if (!config.isProduction) {
  await auth.api.signInMagicLink({ body: { email, callbackURL: '/' }, headers: new Headers() });
  const sent = lastOutboxMessage();
  const link = sent?.body.match(/https?:\/\/\S+/)?.[0];
  process.stdout.write(
    link
      ? `\nSign in here (the link works once, within the hour):\n\n  ${link}\n\n`
      : `\nA sign-in link has been sent to ${email}.\n\n`,
  );
}

await handle.close();

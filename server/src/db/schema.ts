// The whole database in one file. Change it, run `pnpm db:generate`, read the
// SQL it wrote, then `pnpm db:migrate`. Never edit a migration that has been
// applied anywhere.
//
// The four tables at the top are Better Auth's own — the columns, names and
// defaults are what `npx @better-auth/cli generate` produces for the Drizzle
// adapter with our options, so a future upgrade can regenerate them and show
// a readable diff. Singular table names, snake_case columns; the extra
// columns on `user` are declared to Better Auth as additional fields in
// `auth.ts`.
//
// One deliberate difference: every timestamp here carries its time zone,
// where the generator writes a plain one. A plain timestamp is a wall-clock
// reading with no zone attached, so `now()` fills it with whatever the server
// believes the local time to be — which meant a job queued for an hour's time
// was picked up at once on a machine set to anything but UTC. A time in this
// app is an instant, and the column now says so.
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { withTracking } from './tracking.ts';

// People and sessions --------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text('role').default('member'),
  active: boolean('active').default(true),
  locale: text('locale'),
  timeZone: text('time_zone'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// The worked example ---------------------------------------------------------
// Delete this table and its routes when the real thing takes its place.

export const items = pgTable(
  'items',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    // A calendar day in the app's time zone, not an instant: "due on the 4th"
    // means the same thing wherever the person reading it happens to be.
    dueOn: date('due_on'),
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    // Nothing is erased. A deleted row keeps its history and stays out of lists.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...withTracking(),
  },
  (table) => [
    // The order every list uses, so a page is a range scan rather than a sort.
    index('items_created_at_id_idx').on(table.createdAt.desc(), table.id),
    index('items_status_created_at_id_idx').on(table.status, table.createdAt.desc(), table.id),
    index('items_assignee_id_idx').on(table.assigneeId),
  ],
);

// History --------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: ['created', 'updated', 'deleted', 'restored'] }).notNull(),
    changes: jsonb('changes')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('audit_log_entity_entity_id_at_idx').on(table.entity, table.entityId, table.at.desc()),
  ],
);

// Files ----------------------------------------------------------------------

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    ...withTracking(),
  },
  (table) => [index('attachments_entity_entity_id_idx').on(table.entity, table.entityId)],
);

// Background work ------------------------------------------------------------

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // The claim query's index: the worker asks for the oldest due queued job.
    index('jobs_status_run_at_idx').on(table.status, table.runAt),
    index('jobs_name_status_idx').on(table.name, table.status),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    channel: text('channel').notNull().default('email'),
    subject: text('subject').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'failed'] })
      .notNull()
      .default('queued'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('notifications_status_created_at_idx').on(table.status, table.createdAt.desc()),
  ],
);

// One row per recurring job, so a restart picks up where the last one left off
// instead of running everything again.
export const schedules = pgTable('schedules', {
  name: text('name').primaryKey(),
  spec: text('spec').notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
});

export const schema = {
  user,
  session,
  account,
  verification,
  items,
  auditLog,
  attachments,
  jobs,
  notifications,
  schedules,
};

export type ItemRow = typeof items.$inferSelect;
export type UserRow = typeof user.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;

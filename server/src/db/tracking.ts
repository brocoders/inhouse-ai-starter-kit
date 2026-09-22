// Every table in this kit answers "when did this change, and who changed it".
// Spreading the four columns by hand invites a table that forgets one, so they
// are spread from here instead.
//
// The timestamps carry their zone, so a row records the instant something
// happened and not a reading off whichever clock the server happens to keep.
// The app's own time zone is a separate matter — what to call that instant
// when somebody reads it, and when a daily job runs — and lives in `time.ts`.
import { text, timestamp } from 'drizzle-orm/pg-core';

export const withTracking = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

/** The columns an audit diff ignores, because they change on every write. */
export const TRACKING_COLUMNS = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

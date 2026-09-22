// Every table in this kit answers "when did this change, and who changed it".
// Spreading the four columns by hand invites a table that forgets one, so they
// are spread from here instead.
//
// Timestamps are stored without a zone and always hold UTC. Drizzle writes
// `toISOString()` and reads the value back as UTC, so the round trip is exact
// whatever the server's own clock is set to; the app's time zone is a display
// and scheduling concern, handled in `time.ts`.
import { text, timestamp } from 'drizzle-orm/pg-core';

export const withTracking = () => ({
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

/** The columns an audit diff ignores, because they change on every write. */
export const TRACKING_COLUMNS = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

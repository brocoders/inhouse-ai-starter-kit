// The contract between the server and the screens. Both sides import from
// here; neither redefines a shape. Zod 4 — schemas are the types.
//
// Every list endpoint speaks the same grammar: filters as query parameters,
// `cursor` as the id of the last row shown, `limit` up to 200, and a page
// back with `total` and `nextCursor`. Every row that people care about
// carries the tracking fields.
import { z } from 'zod';

export const Role = z.enum(['owner', 'member', 'viewer']);
export type Role = z.infer<typeof Role>;

export const Tracking = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

export const ListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof ListQuery>;

export function page<T extends z.ZodType>(row: T) {
  return z.object({
    rows: z.array(row),
    total: z.number().int(),
    nextCursor: z.string().nullable(),
  });
}

// People -------------------------------------------------------------------

export const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: Role,
  active: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof User>;

export const Me = User.extend({ locale: z.string(), timeZone: z.string() });
export type Me = z.infer<typeof Me>;

export const InviteInput = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  role: Role,
});
export const UpdateUserInput = z.object({ role: Role.optional(), active: z.boolean().optional() });

// What people may change about themselves. Their role and whether they are
// still active are not on this list: those are an owner's to decide.
export const UpdateMeInput = z.object({ name: z.string().trim().min(1).max(120).optional() });
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

// The example entity ---------------------------------------------------------
// `items` is the worked example every new app copies and then deletes. One
// title, a status, an optional due date and an optional owner: enough to show
// a list, a detail page, a form, history, a scheduled job and a notification.

export const ItemStatus = z.enum(['open', 'done']);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const Item = Tracking.extend({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: ItemStatus,
  dueOn: z.iso.date().nullable(), // a calendar day in the app's time zone
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
});
export type Item = z.infer<typeof Item>;

export const ItemInput = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(5000).nullable().optional(),
  status: ItemStatus.default('open'),
  dueOn: z.iso.date().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});
export type ItemInput = z.infer<typeof ItemInput>;

// A change to one item. Every field is optional — send only what moved. Note
// this is not `ItemInput.partial()`: that would keep the `status` default and
// quietly reopen a done item on a form that never mentioned status.
export const ItemPatchInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  status: ItemStatus.optional(),
  dueOn: z.iso.date().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  // The `updatedAt` the screen last saw. If the row has moved on since, the
  // server answers `conflict` instead of overwriting somebody else's change.
  updatedAt: z.iso.datetime().optional(),
});
export type ItemPatchInput = z.infer<typeof ItemPatchInput>;

export const ItemListQuery = ListQuery.extend({
  status: ItemStatus.optional(),
  assigneeId: z.string().optional(),
  due: z.enum(['overdue', 'week', 'none']).optional(),
});
export type ItemListQuery = z.infer<typeof ItemListQuery>;
export const ItemPage = page(Item);

// History --------------------------------------------------------------------

export const AuditEvent = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  entity: z.string(), // table name, e.g. "items"
  entityId: z.string(),
  action: z.enum(['created', 'updated', 'deleted', 'restored']),
  changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
export const AuditPage = page(AuditEvent);

// Attachments ----------------------------------------------------------------

export const Attachment = z.object({
  id: z.string(),
  entity: z.string(),
  entityId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
});
export type Attachment = z.infer<typeof Attachment>;

// Operations -----------------------------------------------------------------
// The health page shows only what is wrong; `problems` is empty when all is
// well and the page says so in one line.

export const Problem = z.object({
  code: z.string(),
  severity: z.enum(['warning', 'error']),
  message: z.string(), // for the owner, plain words
  since: z.iso.datetime().nullable(),
  href: z.string().nullable(),
});
export type Problem = z.infer<typeof Problem>;

export const JobSummary = z.object({
  name: z.string(),
  queued: z.number().int(),
  running: z.number().int(),
  failed24h: z.number().int(),
  lastSucceededAt: z.iso.datetime().nullable(),
  lastFailedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
});

export const OpsStatus = z.object({
  release: z.string(),
  startedAt: z.iso.datetime(),
  schemaVersion: z.number().int(),
  database: z.enum(['ok', 'degraded', 'down']),
  problems: z.array(Problem),
  jobs: z.array(JobSummary),
  recentErrors: z.array(
    z.object({
      at: z.iso.datetime(),
      requestId: z.string().nullable(),
      message: z.string(),
      count: z.number().int(),
    }),
  ),
  disk: z.object({ freeBytes: z.number().int(), totalBytes: z.number().int() }).nullable(),
  lastBackupAt: z.iso.datetime().nullable(),
});
export type OpsStatus = z.infer<typeof OpsStatus>;

// Errors ---------------------------------------------------------------------
// Every non-2xx response has this body. `kind` is the taxonomy the whole app
// uses; the message is safe to show to a person.

export const ApiError = z.object({
  kind: z.enum([
    'validation',
    'auth',
    'forbidden',
    'not_found',
    'conflict',
    'transient',
    'permanent',
  ]),
  message: z.string(),
  requestId: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

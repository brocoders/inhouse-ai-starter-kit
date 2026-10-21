// The things that can happen to a record, named once.
//
// The database column, the API contract, the server's audit code and the
// history list on the screen all read this list, so adding an action — an
// "approved", a "sent" — is one entry here and one sentence in the
// dictionary (`history.<action>`), not an edit in four files. On the first
// real app, four files were what it took, and one of them was forgotten.
export const AUDIT_ACTIONS = ['created', 'updated', 'deleted', 'restored'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

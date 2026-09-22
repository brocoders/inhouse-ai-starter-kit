// Files people attach to a record. They live on the server's own disk under
// `DATA_DIR/files/`, one file per id, with the name and type the person
// uploaded kept in the database. A Docker volume holds that directory, the
// nightly backup copies it, and there is no storage account to open.
//
// The id on disk is ours, never the uploaded name: a file called `../../etc`
// then cannot become a path.
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Attachment } from '../../../shared/schemas.ts';
import { requireRole, type AppEnv } from '../auth.ts';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { recordChange } from '../db/audit.ts';
import { attachments } from '../db/schema.ts';
import { AppError, notFound } from '../errors.ts';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const filePath = (id: string): string => path.join(config.filesDir, id);

function toAttachment(row: typeof attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({ entity: z.string().min(1).max(80), entityId: z.string().min(1).max(80) });

export const attachmentsRoutes = new Hono<AppEnv>()
  .get('/', requireRole('viewer'), zValidator('query', listQuery), async (c) => {
    const { entity, entityId } = c.req.valid('query');
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.entity, entity), eq(attachments.entityId, entityId)))
      .orderBy(desc(attachments.createdAt));
    return c.json(rows.map(toAttachment));
  })
  .post('/', requireRole('member'), async (c) => {
    const form = await c.req.parseBody();
    const entity = typeof form.entity === 'string' ? form.entity : '';
    const entityId = typeof form.entityId === 'string' ? form.entityId : '';
    const file = form.file;
    if (!entity || !entityId) {
      throw new AppError('validation', 'Say which record the file belongs to.', {
        entity: 'required',
        entityId: 'required',
      });
    }
    if (!(file instanceof File)) throw new AppError('validation', 'No file arrived.', { file: 'required' });
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError('validation', 'That file is larger than 20 MB, which is the most this app accepts.', {
        file: 'too large',
      });
    }

    const id = randomUUID();
    const actor = c.get('user');
    await mkdir(config.filesDir, { recursive: true });
    await writeFile(filePath(id), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });

    const now = new Date();
    const row: typeof attachments.$inferInsert = {
      id,
      entity,
      entityId,
      // A name chosen by whoever uploaded it: kept for display, never used as a path.
      fileName: path.basename(file.name || 'file'),
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };
    await db.insert(attachments).values(row);
    const [saved] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    if (!saved) throw notFound('The file you just uploaded');
    await recordChange(db, {
      actorId: actor.id,
      entity: 'attachments',
      entityId: id,
      action: 'created',
      after: toAttachment(saved),
    });
    return c.json(toAttachment(saved), 201);
  })
  .get('/:id', requireRole('viewer'), zValidator('param', idParam), async (c) => {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, c.req.valid('param').id)).limit(1);
    if (!row) throw notFound('That file');
    try {
      await stat(filePath(row.id));
    } catch {
      throw notFound('That file');
    }
    const stream = Readable.toWeb(createReadStream(filePath(row.id))) as ReadableStream;
    return c.body(stream, 200, {
      'Content-Type': row.contentType,
      'Content-Length': String(row.size),
      // Downloaded, not run: an uploaded page never executes on our origin.
      'Content-Disposition': `attachment; filename="${row.fileName.replace(/["\\]/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
  })
  .delete('/:id', requireRole('member'), zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    if (!row) throw notFound('That file');
    await db.delete(attachments).where(eq(attachments.id, id));
    await unlink(filePath(id)).catch(() => {
      // The row is gone either way; a missing file is not worth failing over.
    });
    await recordChange(db, {
      actorId: c.get('user').id,
      entity: 'attachments',
      entityId: id,
      action: 'deleted',
      before: toAttachment(row),
    });
    return c.body(null, 204);
  });

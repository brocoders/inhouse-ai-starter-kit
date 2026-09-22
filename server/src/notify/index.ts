// One way to tell somebody something. Every message is written down before it
// is sent, so "did they ever get told?" has an answer even when sending failed
// — the health page counts the failures and the owner sees them.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications, user } from '../db/schema.ts';
import { log } from '../log.ts';
import { emailChannel, type Channel } from './email.ts';

export type Notification = {
  /** Who to tell. Give a user id, or an address for somebody not signed up yet. */
  userId?: string | undefined;
  email?: string | undefined;
  subject: string;
  text: string;
  html?: string | undefined;
};

export type NotifyResult = { id: string; status: 'sent' | 'failed' };

export async function notify(input: Notification, channel: Channel = emailChannel): Promise<NotifyResult> {
  let address = input.email;
  if (!address && input.userId) {
    const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, input.userId)).limit(1);
    address = row?.email;
  }

  const id = randomUUID();
  await db.insert(notifications).values({
    id,
    userId: input.userId ?? null,
    channel: channel.name,
    subject: input.subject,
    status: 'queued',
  });

  if (!address) {
    const reason = 'no address to send to';
    await db.update(notifications).set({ status: 'failed', error: reason }).where(eq(notifications.id, id));
    log.error({ notificationId: id }, `notification not sent: ${reason}`);
    return { id, status: 'failed' };
  }

  try {
    await channel.send({ to: address, subject: input.subject, text: input.text, html: input.html });
    await db.update(notifications).set({ status: 'sent', sentAt: new Date() }).where(eq(notifications.id, id));
    return { id, status: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db.update(notifications).set({ status: 'failed', error: reason }).where(eq(notifications.id, id));
    // The address itself never reaches the log.
    log.error({ notificationId: id }, `notification not sent: ${reason}`);
    return { id, status: 'failed' };
  }
}

export type { Channel, Message } from './email.ts';

// Every background job in the app, declared in one place so that reading this
// file tells you everything that happens without somebody clicking.
//
// `items.due-reminder` is the worked example: once a day, anybody with items
// past their due date gets one message listing them — one message, not one
// per item, because a person who gets five e-mails reads none of them.
import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { items, user } from '../db/schema.ts';
import { notify } from '../notify/index.ts';
import { calendarDay } from '../time.ts';
import { schedule } from './schedules.ts';
import { defineJob } from './worker.ts';

export const DUE_REMINDER = 'items.due-reminder';

defineJob(DUE_REMINDER, async (_payload, context) => {
  const today = calendarDay();
  const rows = await db
    .select({
      id: items.id,
      title: items.title,
      dueOn: items.dueOn,
      assigneeId: items.assigneeId,
      assigneeName: user.name,
      active: user.active,
    })
    .from(items)
    .innerJoin(user, eq(items.assigneeId, user.id))
    .where(
      and(
        eq(items.status, 'open'),
        isNotNull(items.dueOn),
        lt(items.dueOn, today),
        eq(user.active, true),
        // Deleted items are nobody's problem any more.
        isNull(items.deletedAt),
      ),
    )
    .orderBy(asc(items.dueOn));

  const byPerson = new Map<string, { name: string; lines: string[] }>();
  for (const row of rows) {
    if (!row.assigneeId) continue;
    const entry = byPerson.get(row.assigneeId) ?? { name: row.assigneeName ?? 'there', lines: [] };
    entry.lines.push(`- ${row.title} (was due ${row.dueOn})`);
    byPerson.set(row.assigneeId, entry);
  }

  for (const [userId, entry] of byPerson) {
    await notify({
      userId,
      subject: `${entry.lines.length} overdue ${entry.lines.length === 1 ? 'item' : 'items'} in ${config.appName}`,
      text: [
        `Hello ${entry.name},`,
        '',
        'These are past their due date and still open:',
        '',
        ...entry.lines,
        '',
        `${config.appUrl}/items`,
      ].join('\n'),
    });
  }
  context.log.info({ people: byPerson.size, overdue: rows.length }, 'due reminders sent');
});

schedule(DUE_REMINDER, { daily: '07:00' });

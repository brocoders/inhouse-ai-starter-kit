// The app has one time zone, and a calendar day in it is not a UTC day. Every
// question that starts with "today" or "at seven in the morning" is answered
// here, so the rest of the code never reaches for `getHours()` and quietly
// uses the server's own clock settings.
import { config } from './config.ts';

const DAY_MS = 86_400_000;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function wallClock(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23', // without this, midnight formats as 24 and the maths goes backwards
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

function readParts(at: Date, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of wallClock(timeZone).formatToParts(at)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

/** The calendar day, `YYYY-MM-DD`, that an instant falls on in the app's zone. */
export function calendarDay(at: Date = new Date(), timeZone = config.timeZone): string {
  const p = readParts(at, timeZone);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(p.year ?? 0, 4)}-${pad(p.month ?? 0)}-${pad(p.day ?? 0)}`;
}

/** `YYYY-MM-DD` a whole number of days after another one. */
export function addDays(day: string, days: number): string {
  // Noon, not midnight: a day that loses an hour to daylight saving can never
  // push this over a date boundary.
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** True for a real date, so `2026-02-30` is refused rather than rolled over. */
export function isCalendarDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const at = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}

/**
 * The instant at which a given wall-clock time in the app's zone happens.
 *
 * Format the guess in the target zone, read those wall-clock numbers back as
 * if they were UTC, and the difference is the zone's offset at that instant.
 * Subtract it and repeat: three rounds converge everywhere, because the offset
 * only moves at a transition. A clock time that a daylight-saving jump skips
 * lands on the first instant after the jump, which is when a person would
 * expect a seven-o'clock job to run on the morning the clocks went forward.
 */
export function instantOf(day: string, clock = '00:00', timeZone = config.timeZone): Date {
  const wanted = Date.parse(`${day}T${clock.length === 5 ? clock : '00:00'}:00Z`);
  let guess = wanted;
  for (let round = 0; round < 3; round++) {
    const p = readParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
    guess = wanted - (seen - guess);
  }
  return new Date(guess);
}

/** The next time the clock in the app's zone reads `HH:MM`, strictly after `from`. */
export function nextDailyRun(clock: string, from: Date = new Date(), timeZone = config.timeZone): Date {
  const today = calendarDay(from, timeZone);
  for (const day of [addDays(today, -1), today, addDays(today, 1), addDays(today, 2)]) {
    const at = instantOf(day, clock, timeZone);
    if (at.getTime() > from.getTime()) return at;
  }
  // Only reachable if a zone moved by more than a day, which no zone does.
  return new Date(from.getTime() + DAY_MS);
}

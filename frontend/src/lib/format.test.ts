// The formatters are plain functions over the settings the shell hands them,
// so they run under `node --test` without a browser:
//
//   node --test frontend/src/lib/format.test.ts
//
// What is worth pinning down is the edge of the calendar: the zones furthest
// from UTC, where a day and an instant stop agreeing.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { FormatProvider, dayOf, formatDate, today } from './format.ts';

/** Seed the formatters the way the shell does, without rendering anything. */
function settle(timeZone: string, locale = 'en-GB'): void {
  FormatProvider({ settings: { locale, timeZone }, children: null });
}

describe('a calendar day', () => {
  beforeEach(() => settle('UTC'));

  it('is the same day in the zone fourteen hours ahead of UTC', () => {
    settle('Pacific/Kiritimati');
    assert.equal(formatDate('2026-12-31'), '31 Dec 2026');
    assert.equal(formatDate('2027-01-01'), '1 Jan 2027');
  });

  it('is the same day in the zone eleven hours behind', () => {
    settle('Pacific/Niue');
    assert.equal(formatDate('2026-12-31'), '31 Dec 2026');
  });

  it('is written in the app locale', () => {
    settle('Pacific/Kiritimati', 'en-US');
    assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026');
  });

  it('is a dash when it is not a day at all', () => {
    assert.equal(formatDate('2026-13-40'), '—');
    assert.equal(formatDate('2026-02-30'), '—');
    assert.equal(formatDate(null), '—');
  });
});

describe('the day an instant falls on', () => {
  beforeEach(() => settle('UTC'));

  // 10:30 UTC on the last day of the year: already New Year's Day in
  // Kiritimati, New Year's Eve in UTC, and still the 30th in Niue.
  const instant = '2026-12-31T10:30:00.000Z';

  it('is worked out in the app zone, not read off the UTC string', () => {
    settle('Pacific/Kiritimati');
    assert.equal(dayOf(instant), '2027-01-01');
    assert.equal(formatDate(instant), '1 Jan 2027');
    settle('UTC');
    assert.equal(dayOf(instant), '2026-12-31');
    settle('Pacific/Niue');
    assert.equal(dayOf(instant), '2026-12-30');
  });

  it('leaves a calendar day as it is', () => {
    settle('Pacific/Kiritimati');
    assert.equal(dayOf('2026-12-31'), '2026-12-31');
  });

  it('is what today() answers for now', () => {
    settle('Pacific/Kiritimati');
    const at = new Date(instant);
    assert.equal(today(at), dayOf(at));
  });
});

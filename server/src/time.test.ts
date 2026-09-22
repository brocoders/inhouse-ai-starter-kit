// A calendar day is not a UTC day, and an hour disappears twice a year. These
// are the cases that make "today" and "every morning at seven" wrong when
// nobody checks them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, calendarDay, instantOf, isCalendarDay, nextDailyRun } from './time.ts';

describe('what day it is', () => {
  it('is the day where the app lives, not where the server is', () => {
    // Half past eleven at night in London on New Year's Eve is already the
    // new year in Auckland and still the old one in New York.
    const at = new Date('2026-12-31T23:30:00Z');
    assert.equal(calendarDay(at, 'Europe/London'), '2026-12-31');
    assert.equal(calendarDay(at, 'Pacific/Auckland'), '2027-01-01');
    assert.equal(calendarDay(at, 'America/New_York'), '2026-12-31');
  });

  it('changes at midnight in that zone, not at midnight UTC', () => {
    // New York is four hours behind in March, so its midnight is 04:00 UTC.
    const justBefore = new Date('2026-03-10T03:59:00Z'); // 23:59 in New York
    const justAfter = new Date('2026-03-10T04:01:00Z'); // 00:01 in New York
    assert.equal(calendarDay(justBefore, 'America/New_York'), '2026-03-09');
    assert.equal(calendarDay(justAfter, 'America/New_York'), '2026-03-10');
    // The same two instants are the same UTC day.
    assert.equal(calendarDay(justBefore, 'UTC'), calendarDay(justAfter, 'UTC'));
  });

  it('counts days without tripping over a short one', () => {
    // 29 March 2026 is 23 hours long in Berlin.
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  });

  it('refuses a date that does not exist', () => {
    assert.equal(isCalendarDay('2026-02-30'), false);
    assert.equal(isCalendarDay('2026-13-01'), false);
    assert.equal(isCalendarDay('not a date'), false);
    assert.equal(isCalendarDay('2026-02-28'), true);
  });
});

describe('a daily job', () => {
  it('runs at the same clock time before and after the clocks change', () => {
    const zone = 'Europe/Berlin';
    // Summer time starts on 29 March 2026: 02:00 becomes 03:00.
    const before = nextDailyRun('07:00', new Date('2026-03-28T10:00:00Z'), zone);
    const after = nextDailyRun('07:00', new Date('2026-03-29T10:00:00Z'), zone);
    assert.equal(before.toISOString(), '2026-03-29T05:00:00.000Z'); // 07:00 summer time
    assert.equal(after.toISOString(), '2026-03-30T05:00:00.000Z');
    // The day before the change, seven in the morning was an hour later in UTC.
    const winter = nextDailyRun('07:00', new Date('2026-03-27T10:00:00Z'), zone);
    assert.equal(winter.toISOString(), '2026-03-28T06:00:00.000Z'); // 07:00 winter time
  });

  it('still runs on the morning an hour goes missing', () => {
    // Santiago skips midnight itself when the clocks go forward, so a job set
    // for that moment has to land on the first instant that does exist.
    const zone = 'America/Santiago';
    const run = nextDailyRun('00:00', new Date('2026-09-05T12:00:00Z'), zone);
    assert.ok(run.getTime() > Date.parse('2026-09-05T12:00:00Z'));
    assert.equal(calendarDay(run, zone), '2026-09-06');
  });

  it('never returns a time that has already passed', () => {
    const now = new Date('2026-07-14T06:59:59Z');
    for (const zone of ['UTC', 'Europe/Berlin', 'Pacific/Auckland', 'America/New_York']) {
      const run = nextDailyRun('07:00', now, zone);
      assert.ok(run.getTime() > now.getTime(), `${zone} gave a time in the past`);
      // And the clock does read seven where the app lives.
      const clock = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(run);
      assert.equal(clock, '07:00', `${zone} did not land on seven o'clock`);
    }
  });

  it('turns a day and a clock time into one instant', () => {
    assert.equal(instantOf('2026-06-01', '09:30', 'UTC').toISOString(), '2026-06-01T09:30:00.000Z');
    assert.equal(
      instantOf('2026-06-01', '09:30', 'Europe/Berlin').toISOString(),
      '2026-06-01T07:30:00.000Z',
    );
  });
});

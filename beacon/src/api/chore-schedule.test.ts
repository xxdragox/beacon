import { describe, it, expect } from 'vitest';
import { Chore, ChoreCompletion, ChoreSchedule } from '../types/family';
import {
  addMonths,
  canToggle,
  choreGroup,
  isDueOn,
  occurrencesForDay,
  occurrencesInRange,
  weekdayOf,
} from './chore-schedule';

const TODAY = '2026-10-13'; // a Tuesday

function chore(schedule: ChoreSchedule | undefined, extra: Partial<Chore> = {}): Chore {
  return { id: 'c1', name: 'Chore', assigned_to: ['kid1'], value_cents: 0, schedule, ...extra };
}

/** A completion made at local noon on `day`, satisfying `due`. */
function done(day: string, due: string, member = 'kid1', choreId = 'c1'): ChoreCompletion {
  const [y, m, d] = day.split('-').map(Number);
  return { chore_id: choreId, member_id: member, completed_at: new Date(y, m - 1, d, 12).toISOString(), due_date: due };
}

const states = (occs: { dueDate: string; state: string }[]) => occs.map((o) => `${o.dueDate}:${o.state}`);

describe('date helpers', () => {
  it('knows weekdays and clamps month ends', () => {
    expect(weekdayOf('2026-10-13')).toBe(2);
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
  });
});

describe('isDueOn', () => {
  it('weekly on chosen days', () => {
    const trash: ChoreSchedule = { type: 'weekly', days: [2, 5], every: 1, start: '2026-01-01' };
    expect(['2026-10-13', '2026-10-14', '2026-10-16'].map((d) => isDueOn(trash, d))).toEqual([true, false, true]);
  });

  it('every other week counts from the start week', () => {
    const vacuum: ChoreSchedule = { type: 'weekly', days: [6], every: 2, start: '2026-10-03' };
    expect(['2026-10-03', '2026-10-10', '2026-10-17', '2026-09-26'].map((d) => isDueOn(vacuum, d))).toEqual([true, false, true, false]);
  });

  it('monthly on a day clamps to short months', () => {
    const endOfMonth: ChoreSchedule = { type: 'monthly', every: 1, day: 31, start: '2026-01-01' };
    expect(isDueOn(endOfMonth, '2027-02-28')).toBe(true);
    expect(isDueOn(endOfMonth, '2026-10-31')).toBe(true);
    expect(isDueOn(endOfMonth, '2026-10-30')).toBe(false);
  });

  it('quarterly on the first Saturday', () => {
    const filter: ChoreSchedule = { type: 'monthly', every: 3, nth: 1, weekday: 6, start: '2026-10-01' };
    expect(isDueOn(filter, '2026-10-03')).toBe(true);
    expect(isDueOn(filter, '2026-11-07')).toBe(false); // first Saturday, wrong month
    expect(isDueOn(filter, '2027-01-02')).toBe(true);
    expect(isDueOn(filter, '2026-10-10')).toBe(false); // second Saturday
  });

  it('last weekday of the month', () => {
    const lastFriday: ChoreSchedule = { type: 'monthly', every: 1, nth: -1, weekday: 5, start: '2026-01-01' };
    expect(isDueOn(lastFriday, '2026-10-30')).toBe(true);
    expect(isDueOn(lastFriday, '2026-10-23')).toBe(false);
  });

  it('once', () => {
    expect(isDueOn({ type: 'once', date: '2026-10-25' }, '2026-10-25')).toBe(true);
    expect(isDueOn({ type: 'once', date: '2026-10-25' }, '2026-10-26')).toBe(false);
  });
});

describe('overdue rules', () => {
  const dishes = chore({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], every: 1, start: '2026-01-01' });

  it('a missed daily chore is replaced by today, not piled up', () => {
    expect(states(occurrencesForDay(dishes, [], TODAY, TODAY))).toEqual(['2026-10-13:due']);
    expect(states(occurrencesInRange(dishes, [], '2026-10-12', '2026-10-13', TODAY))).toEqual(['2026-10-12:missed', '2026-10-13:due']);
  });

  it('a missed weekly chore stays overdue until its next day', () => {
    const vacuum = chore({ type: 'weekly', days: [6], every: 1, start: '2026-01-01' }); // Saturdays
    expect(states(occurrencesForDay(vacuum, [], TODAY, TODAY))).toEqual(['2026-10-10:overdue']);
    // Next Saturday replaces it.
    expect(states(occurrencesForDay(vacuum, [], '2026-10-17', '2026-10-17'))).toEqual(['2026-10-17:due']);
  });

  it('an overdue chore checked off today stays visible as done', () => {
    const vacuum = chore({ type: 'weekly', days: [6], every: 1, start: '2026-01-01' });
    const occs = occurrencesForDay(vacuum, [done(TODAY, '2026-10-10')], TODAY, TODAY);
    expect(states(occs)).toEqual(['2026-10-10:done']);
    expect(canToggle(occs[0], TODAY)).toBe(true); // can still undo today
  });

  it('future occurrences are upcoming', () => {
    const trash = chore({ type: 'weekly', days: [2, 5], every: 1, start: '2026-01-01' });
    expect(states(occurrencesInRange(trash, [], TODAY, '2026-10-20', TODAY))).toEqual([
      '2026-10-13:due', '2026-10-16:upcoming', '2026-10-20:upcoming',
    ]);
  });
});

describe('assignment', () => {
  const daily: ChoreSchedule = { type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], every: 1, start: '2026-01-01' };

  it('each assignee has their own occurrence', () => {
    const bed = chore(daily, { assigned_to: ['kid1', 'kid2'] });
    const occs = occurrencesForDay(bed, [done(TODAY, TODAY, 'kid1')], TODAY, TODAY);
    expect(occs.map((o) => `${o.memberId}:${o.state}`)).toEqual(['kid1:done', 'kid2:due']);
  });

  it('a shared chore is done once by anyone', () => {
    const trash = chore(daily, { assigned_to: ['kid1', 'kid2'], shared: true });
    const occs = occurrencesForDay(trash, [done(TODAY, TODAY, 'kid2')], TODAY, TODAY);
    expect(occs.map((o) => `${o.memberId}:${o.state}`)).toEqual(['null:done']);
  });

  it('an unassigned chore is open to anyone', () => {
    const open = chore(daily, { assigned_to: [] });
    expect(occurrencesForDay(open, [], TODAY, TODAY).map((o) => o.memberId)).toEqual([null]);
  });
});

describe('"after last done" schedules', () => {
  const sheets = chore({ type: 'after', every: 2, unit: 'week', start: '2026-10-01' });

  it('is due from its start until done', () => {
    expect(states(occurrencesForDay(sheets, [], TODAY, TODAY))).toEqual(['2026-10-01:overdue']);
  });

  it('counts the next one from when it was actually done', () => {
    const completions = [done(TODAY, '2026-10-01')];
    expect(states(occurrencesInRange(sheets, completions, TODAY, '2026-11-30', TODAY))).toEqual([
      '2026-10-27:upcoming', '2026-11-10:upcoming', '2026-11-24:upcoming',
    ]);
  });

  it('an overdue one does not stack occurrences up to today', () => {
    const daily = chore({ type: 'after', every: 1, unit: 'day', start: '2026-10-10' });
    expect(states(occurrencesInRange(daily, [], '2026-10-10', '2026-10-15', TODAY))).toEqual([
      '2026-10-10:overdue', '2026-10-14:upcoming', '2026-10-15:upcoming',
    ]);
  });
});

describe('canToggle', () => {
  const trash = chore({ type: 'weekly', days: [2, 5], every: 1, start: '2026-01-01' });

  it('allows today and overdue, never missed, upcoming, or earlier check-offs', () => {
    const [due] = occurrencesForDay(trash, [], TODAY, TODAY);
    expect(canToggle(due, TODAY)).toBe(true);
    const range = occurrencesInRange(trash, [done('2026-10-09', '2026-10-09')], '2026-10-06', '2026-10-16', TODAY);
    const byDate = Object.fromEntries(range.map((o) => [o.dueDate, o]));
    expect(byDate['2026-10-06'].state).toBe('missed');
    expect(canToggle(byDate['2026-10-06'], TODAY)).toBe(false);
    expect(canToggle(byDate['2026-10-09'], TODAY)).toBe(false); // done on an earlier day
    expect(canToggle(byDate['2026-10-16'], TODAY)).toBe(false); // upcoming
  });
});

describe('legacy chores and grouping', () => {
  it('treats chores saved before scheduling as daily', () => {
    const old = chore(undefined, { frequency: 'weekly' });
    expect(states(occurrencesForDay(old, [], TODAY, TODAY))).toEqual(['2026-10-13:due']);
    expect(choreGroup(old)).toBe('daily');
  });

  it('groups by how often a chore comes around', () => {
    const g = (s: ChoreSchedule) => choreGroup(chore(s));
    expect(g({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], every: 1, start: '2026-01-01' })).toBe('daily');
    expect(g({ type: 'weekly', days: [2, 5], every: 1, start: '2026-01-01' })).toBe('weekly');
    expect(g({ type: 'weekly', days: [6], every: 2, start: '2026-01-01' })).toBe('few-weeks');
    expect(g({ type: 'monthly', every: 1, day: 1, start: '2026-01-01' })).toBe('monthly');
    expect(g({ type: 'monthly', every: 3, nth: 1, weekday: 6, start: '2026-01-01' })).toBe('quarterly');
    expect(g({ type: 'monthly', every: 12, day: 1, start: '2026-01-01' })).toBe('yearly');
    expect(g({ type: 'after', every: 2, unit: 'week', start: '2026-01-01' })).toBe('few-weeks');
    expect(g({ type: 'once', date: '2026-10-25' })).toBe('once');
  });
});

describe('describeSchedule', () => {
  it('reads like a person would say it', async () => {
    const { describeSchedule } = await import('./chore-schedule');
    const d = (s: ChoreSchedule) => describeSchedule(s);
    expect(d({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], every: 1, start: '2026-01-01' })).toBe('Every day');
    expect(d({ type: 'weekly', days: [1, 2, 3, 4, 5], every: 1, start: '2026-01-01' })).toBe('Every week on weekdays');
    expect(d({ type: 'weekly', days: [2, 5], every: 1, start: '2026-01-01' })).toBe('Every week on Tue, Fri');
    expect(d({ type: 'weekly', days: [6], every: 1, start: '2026-01-01' })).toBe('Every Saturday');
    expect(d({ type: 'weekly', days: [6], every: 2, start: '2026-01-01' })).toBe('Every other week on Saturday');
    expect(d({ type: 'monthly', every: 1, day: 1, start: '2026-01-01' })).toBe('Every month on the 1st');
    expect(d({ type: 'monthly', every: 3, nth: 1, weekday: 6, start: '2026-01-01' })).toBe('Every 3 months (quarterly) on the first Saturday');
    expect(d({ type: 'monthly', every: 1, nth: -1, weekday: 5, start: '2026-01-01' })).toBe('Every month on the last Friday');
    expect(d({ type: 'after', every: 2, unit: 'week', start: '2026-01-01' })).toBe("Every other week after it's done");
    expect(d({ type: 'after', every: 4, unit: 'day', start: '2026-01-01' })).toBe("Every 4 days after it's done");
    expect(d({ type: 'once', date: '2026-10-25' })).toBe('Once on Oct 25, 2026');
  });
});

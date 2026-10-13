/**
 * Chore scheduling: when a chore is due and what state each occurrence is in.
 *
 * Pure functions over local "YYYY-MM-DD" date strings (day arithmetic is done
 * in UTC so DST never shifts a date). An occurrence is one due date of a chore
 * for one person — or for the whole chore when it's shared (or unassigned),
 * in which case `memberId` is null and anyone's completion satisfies it.
 *
 * A missed occurrence stays **overdue** until it's done or the chore's next
 * occurrence comes due, which replaces it (the old one becomes **missed**), so
 * daily chores never pile up and monthly ones never silently disappear.
 */
import { Chore, ChoreCompletion, ChoreSchedule, Weekday } from '../types/family';
import { localDayKey } from './date-keys';

// ─── Date helpers ("YYYY-MM-DD") ───

const DAY_MS = 86400000;

function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function weekdayOf(date: string): Weekday {
  return new Date(toDayNumber(date) * DAY_MS).getUTCDay() as Weekday;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Same day-of-month `months` later, clamped to the month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

function addInterval(date: string, every: number, unit: 'day' | 'week' | 'month'): string {
  if (unit === 'month') return addMonths(date, every);
  return addDays(date, unit === 'week' ? every * 7 : every);
}

// ─── Schedules ───

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** A chore's schedule; chores saved before scheduling (legacy `frequency`) are converted. */
export function scheduleOf(chore: Chore): ChoreSchedule {
  if (chore.schedule) return chore.schedule;
  // Upstream never acted on `frequency` — every chore showed every day — so
  // treat old chores as daily, except one-offs, which stay due until done.
  if (chore.frequency === 'once') return { type: 'after', every: 100000, unit: 'day', start: '2000-01-01' };
  return { type: 'weekly', days: ALL_DAYS, every: 1, start: '2000-01-01' };
}

/** Whether a calendar-based schedule (weekly / monthly / once) falls on `date`. */
export function isDueOn(schedule: ChoreSchedule, date: string): boolean {
  switch (schedule.type) {
    case 'once':
      return date === schedule.date;
    case 'weekly': {
      if (date < schedule.start || !schedule.days.includes(weekdayOf(date))) return false;
      const startWeek = toDayNumber(schedule.start) - weekdayOf(schedule.start);
      const week = Math.floor((toDayNumber(date) - startWeek) / 7);
      return week % Math.max(1, schedule.every) === 0;
    }
    case 'monthly': {
      if (date < schedule.start) return false;
      const d = parts(date);
      const s = parts(schedule.start);
      const monthDiff = (d.year * 12 + d.month) - (s.year * 12 + s.month);
      if (monthDiff % Math.max(1, schedule.every) !== 0) return false;
      const dim = daysInMonth(d.year, d.month);
      if (schedule.day !== undefined) return d.day === Math.min(schedule.day, dim);
      if (schedule.weekday === undefined || schedule.nth === undefined) return false;
      if (weekdayOf(date) !== schedule.weekday) return false;
      return schedule.nth === -1 ? d.day + 7 > dim : Math.ceil(d.day / 7) === schedule.nth;
    }
    case 'after':
      return false; // depends on completions, see afterDueDates()
  }
}

/** Longest gap to search back for the previous occurrence (covers "every 24 months"). */
const LOOKBACK_DAYS = 800;

/** The latest calendar occurrence on or before `date`, or null. */
function previousOccurrence(schedule: ChoreSchedule, date: string): string | null {
  if (schedule.type === 'once') return schedule.date <= date ? schedule.date : null;
  for (let i = 0; i <= LOOKBACK_DAYS; i++) {
    const d = addDays(date, -i);
    if ('start' in schedule && d < schedule.start) return null;
    if (isDueOn(schedule, d)) return d;
  }
  return null;
}

function calendarDueDates(schedule: ChoreSchedule, from: string, to: string): string[] {
  if (schedule.type === 'once') return schedule.date >= from && schedule.date <= to ? [schedule.date] : [];
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isDueOn(schedule, d)) out.push(d);
  return out;
}

// ─── Occurrences ───

export type OccurrenceState = 'done' | 'due' | 'overdue' | 'missed' | 'upcoming';

export interface ChoreOccurrence {
  chore: Chore;
  /** Whose occurrence this is; null when the chore is shared or unassigned (anyone can do it). */
  memberId: string | null;
  dueDate: string;
  state: OccurrenceState;
  /** The completion that satisfied it, when done. */
  completion?: ChoreCompletion;
}

/** Shared and unassigned chores are done once by anyone; otherwise each assignee has their own. */
export function isSharedChore(chore: Chore): boolean {
  return !!chore.shared || chore.assigned_to.length === 0;
}

function targetsOf(chore: Chore): Array<string | null> {
  return isSharedChore(chore) ? [null] : chore.assigned_to;
}

/** The occurrence date a completion satisfies (older completions: the day they were made). */
export function completionDueDate(c: ChoreCompletion): string {
  return c.due_date ?? localDayKey(c.completed_at);
}

function relevantCompletions(chore: Chore, memberId: string | null, completions: ChoreCompletion[]) {
  return completions.filter((c) => c.chore_id === chore.id && (memberId === null || c.member_id === memberId));
}

/** "After last done" schedule: completed due dates plus the next due date. */
function afterDueDates(schedule: Extract<ChoreSchedule, { type: 'after' }>, done: ChoreCompletion[]) {
  const last = [...done].sort((a, b) => a.completed_at.localeCompare(b.completed_at)).pop();
  const next = last ? addInterval(localDayKey(last.completed_at), schedule.every, schedule.unit) : schedule.start;
  return { doneDates: done.map(completionDueDate), next };
}

function stateOf(
  dueDate: string,
  completion: ChoreCompletion | undefined,
  today: string,
  latestOnOrBeforeToday: string | null,
): OccurrenceState {
  if (completion) return 'done';
  if (dueDate > today) return 'upcoming';
  if (dueDate === today) return 'due';
  return dueDate === latestOnOrBeforeToday ? 'overdue' : 'missed';
}

/** Every occurrence of `chore` due between `from` and `to` (inclusive), for each person it applies to. */
export function occurrencesInRange(
  chore: Chore,
  completions: ChoreCompletion[],
  from: string,
  to: string,
  today: string,
): ChoreOccurrence[] {
  const schedule = scheduleOf(chore);
  const out: ChoreOccurrence[] = [];
  for (const memberId of targetsOf(chore)) {
    const done = relevantCompletions(chore, memberId, completions);
    const find = (date: string) => done.find((c) => completionDueDate(c) === date);
    let dates: string[];
    let latest: string | null;
    if (schedule.type === 'after') {
      const { doneDates, next } = afterDueDates(schedule, done);
      dates = doneDates.filter((d) => d >= from && d <= to);
      // The next due date, then later ones projected as if each is done on
      // time. An overdue one stays a single item: the projection resumes from
      // today rather than stacking occurrences between it and today.
      for (let d = next; d <= to; d = addInterval(d < today ? today : d, schedule.every, schedule.unit)) {
        if (d >= from && !dates.includes(d)) dates.push(d);
      }
      latest = next <= today ? next : null;
    } else {
      dates = calendarDueDates(schedule, from, to);
      latest = previousOccurrence(schedule, today);
    }
    for (const dueDate of dates.sort()) {
      const completion = find(dueDate);
      out.push({ chore, memberId, dueDate, completion, state: stateOf(dueDate, completion, today, latest) });
    }
  }
  return out;
}

/**
 * What to show for `chore` on `date`: its occurrences due that day and, when
 * `date` is today, anything still overdue plus anything checked off today.
 */
export function occurrencesForDay(
  chore: Chore,
  completions: ChoreCompletion[],
  date: string,
  today: string,
): ChoreOccurrence[] {
  const onDay = occurrencesInRange(chore, completions, date, date, today);
  if (date !== today) return onDay;

  const out = [...onDay];
  const seen = new Set(out.map((o) => `${o.memberId}|${o.dueDate}`));
  const add = (o: ChoreOccurrence) => {
    const key = `${o.memberId}|${o.dueDate}`;
    if (!seen.has(key)) { seen.add(key); out.push(o); }
  };

  // Still-overdue occurrences (at most one per person: later ones replace earlier).
  const lookbackStart = addDays(today, -LOOKBACK_DAYS);
  for (const o of occurrencesInRange(chore, completions, lookbackStart, addDays(today, -1), today)) {
    if (o.state === 'overdue') add(o);
  }
  // Earlier occurrences checked off today, so they stay visible as done.
  for (const memberId of targetsOf(chore)) {
    for (const c of relevantCompletions(chore, memberId, completions)) {
      if (localDayKey(c.completed_at) === today) {
        add({ chore, memberId, dueDate: completionDueDate(c), state: 'done', completion: c });
      }
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Check-offs are limited to today and overdue (no back-filling); undo is limited to today's check-offs. */
export function canToggle(occurrence: ChoreOccurrence, today: string): boolean {
  if (occurrence.state === 'due' || occurrence.state === 'overdue') return true;
  if (occurrence.state === 'done') return !!occurrence.completion && localDayKey(occurrence.completion.completed_at) === today;
  return false;
}

// ─── Grouping for the Manage list ───

export type ChoreGroup = 'daily' | 'weekly' | 'few-weeks' | 'monthly' | 'quarterly' | 'yearly' | 'once';

export const CHORE_GROUP_ORDER: ChoreGroup[] = ['daily', 'weekly', 'few-weeks', 'monthly', 'quarterly', 'yearly', 'once'];

function groupForDays(days: number): ChoreGroup {
  if (days <= 1) return 'daily';
  if (days <= 7) return 'weekly';
  if (days <= 21) return 'few-weeks';
  if (days <= 45) return 'monthly';
  if (days <= 120) return 'quarterly';
  return 'yearly';
}

/** Roughly how often a chore comes around, for grouping. */
export function choreGroup(chore: Chore): ChoreGroup {
  const s = scheduleOf(chore);
  switch (s.type) {
    case 'once':
      return 'once';
    case 'weekly':
      if (s.every === 1 && s.days.length === 7) return 'daily';
      return s.every === 1 ? 'weekly' : groupForDays(s.every * 7);
    case 'monthly':
      if (s.every === 1) return 'monthly';
      return s.every <= 4 ? 'quarterly' : 'yearly';
    case 'after':
      if (s.every >= 100000) return 'once'; // legacy one-off
      return groupForDays(s.unit === 'month' ? s.every * 30 : s.unit === 'week' ? s.every * 7 : s.every);
  }
}

// ─── Descriptions ───

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NTH_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

function every(n: number, unit: string): string {
  if (n === 1) return `Every ${unit}`;
  if (n === 2 && unit === 'week') return 'Every other week';
  return `Every ${n} ${unit}s`;
}

export function formatShortDate(date: string): string {
  const { year, month, day } = parts(date);
  return `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
}

/** Plain-English schedule, e.g. "Every other week on Saturday", "Every 3 months on the first Saturday". */
export function describeSchedule(schedule: ChoreSchedule): string {
  switch (schedule.type) {
    case 'once':
      return `Once on ${formatShortDate(schedule.date)}`;
    case 'weekly': {
      const days = [...schedule.days].sort();
      if (days.length === 7 && schedule.every === 1) return 'Every day';
      if (days.length === 0) return 'No days chosen';
      const weekdays = days.length === 5 && days.every((d) => d >= 1 && d <= 5);
      const dayText = weekdays ? 'weekdays'
        : days.length === 2 && days[0] === 0 && days[1] === 6 ? 'weekends'
          : days.length === 1 ? DAY_NAMES[days[0]]
            : days.map((d) => DAY_SHORT[d]).join(', ');
      if (schedule.every === 1) return days.length === 1 ? `Every ${dayText}` : `Every week on ${dayText}`;
      return `${every(schedule.every, 'week')} on ${dayText}`;
    }
    case 'monthly': {
      const base = schedule.every === 3 ? 'Every 3 months (quarterly)'
        : schedule.every === 12 ? 'Every year' : every(schedule.every, 'month');
      if (schedule.day !== undefined) return `${base} on the ${ordinal(schedule.day)}`;
      if (schedule.nth !== undefined && schedule.weekday !== undefined) {
        return `${base} on the ${NTH_NAMES[schedule.nth]} ${DAY_NAMES[schedule.weekday]}`;
      }
      return base;
    }
    case 'after':
      if (schedule.every >= 100000) return 'Once, until done';
      return `${every(schedule.every, schedule.unit)} after it's done`;
  }
}

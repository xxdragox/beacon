/**
 * Family birthdays.
 *
 * A member's birthday is stored as "MM-DD" (no year), so it recurs every year.
 * A 29 February birthday is celebrated on 28 February in non-leap years.
 */
import type { FamilyMember } from '../types/family';

const BIRTHDAY_RE = /^(\d{2})-(\d{2})$/;

/** Parses "MM-DD" into a 1-based month and day, or null if it isn't a real date. */
export function parseBirthday(value: string | undefined): { month: number; day: number } | null {
  const m = value ? BIRTHDAY_RE.exec(value) : null;
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1) return null;
  // Use a leap year so 29 February is accepted.
  if (day > new Date(2024, month, 0).getDate()) return null;
  return { month, day };
}

/** Formats a 1-based month and day as "MM-DD". */
export function formatBirthday(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isLeapYear(year: number): boolean {
  return new Date(year, 1, 29).getMonth() === 1;
}

/** Whether `birthday` ("MM-DD") falls on the local calendar day `date`. */
export function isBirthdayOn(birthday: string | undefined, date: Date): boolean {
  const b = parseBirthday(birthday);
  if (!b) return false;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (b.month === month && b.day === day) return true;
  // 29 Feb birthdays move to 28 Feb when there is no 29th.
  return b.month === 2 && b.day === 29 && month === 2 && day === 28 && !isLeapYear(date.getFullYear());
}

/** Members whose birthday is on the local calendar day `date`. */
export function birthdaysOn(date: Date, members: readonly FamilyMember[]): FamilyMember[] {
  return members.filter((m) => isBirthdayOn(m.birthday, date));
}

/** A stable local "yyyy-MM-dd" key. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Birthdays on each day from `start` to `end` (both inclusive, local days),
 * keyed "yyyy-MM-dd". Days without a birthday are left out.
 */
export function birthdaysInRange(
  start: Date,
  end: Date,
  members: readonly FamilyMember[],
): Map<string, FamilyMember[]> {
  const map = new Map<string, FamilyMember[]>();
  const withBirthday = members.filter((m) => parseBirthday(m.birthday));
  if (withBirthday.length === 0) return map;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  for (; d.getTime() <= last; d.setDate(d.getDate() + 1)) {
    const list = birthdaysOn(d, withBirthday);
    if (list.length > 0) map.set(dayKey(d), list);
  }
  return map;
}

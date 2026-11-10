import { describe, it, expect } from 'vitest';
import type { FamilyMember } from '../types/family';
import { birthdaysInRange, birthdaysOn, formatBirthday, isBirthdayOn, parseBirthday } from './birthdays';

function member(name: string, birthday?: string): FamilyMember {
  return { id: name, name, avatar: '🙂', color: '#3fa8ff', role: 'child', birthday };
}

describe('parseBirthday', () => {
  it('parses MM-DD', () => {
    expect(parseBirthday('03-07')).toEqual({ month: 3, day: 7 });
    expect(parseBirthday('02-29')).toEqual({ month: 2, day: 29 });
  });

  it('rejects missing or impossible dates', () => {
    expect(parseBirthday(undefined)).toBeNull();
    expect(parseBirthday('')).toBeNull();
    expect(parseBirthday('2020-03-07')).toBeNull();
    expect(parseBirthday('13-01')).toBeNull();
    expect(parseBirthday('04-31')).toBeNull();
    expect(parseBirthday('02-30')).toBeNull();
    expect(parseBirthday('00-10')).toBeNull();
  });

  it('round-trips with formatBirthday', () => {
    expect(formatBirthday(3, 7)).toBe('03-07');
    expect(parseBirthday(formatBirthday(12, 25))).toEqual({ month: 12, day: 25 });
  });
});

describe('isBirthdayOn', () => {
  it('matches the same month and day in any year', () => {
    expect(isBirthdayOn('11-10', new Date(2026, 10, 10))).toBe(true);
    expect(isBirthdayOn('11-10', new Date(2031, 10, 10, 23, 59))).toBe(true);
    expect(isBirthdayOn('11-10', new Date(2026, 10, 11))).toBe(false);
    expect(isBirthdayOn(undefined, new Date(2026, 10, 10))).toBe(false);
  });

  it('celebrates 29 February on 28 February in non-leap years', () => {
    expect(isBirthdayOn('02-29', new Date(2027, 1, 28))).toBe(true);
    expect(isBirthdayOn('02-29', new Date(2028, 1, 28))).toBe(false);
    expect(isBirthdayOn('02-29', new Date(2028, 1, 29))).toBe(true);
  });
});

describe('birthdaysOn', () => {
  it('returns every member whose birthday is that day', () => {
    const members = [member('Ava', '05-01'), member('Ben', '05-01'), member('Cal', '06-01'), member('Dee')];
    expect(birthdaysOn(new Date(2026, 4, 1), members).map((m) => m.name)).toEqual(['Ava', 'Ben']);
    expect(birthdaysOn(new Date(2026, 4, 2), members)).toEqual([]);
  });
});

describe('birthdaysInRange', () => {
  const members = [member('Ava', '12-31'), member('Ben', '01-02'), member('Cal', '07-04'), member('Dee')];

  it('maps days in range (inclusive) to birthdays, across a year boundary', () => {
    const map = birthdaysInRange(new Date(2026, 11, 28), new Date(2027, 0, 3), members);
    expect([...map.keys()]).toEqual(['2026-12-31', '2027-01-02']);
    expect(map.get('2026-12-31')!.map((m) => m.name)).toEqual(['Ava']);
  });

  it('includes the end day', () => {
    const map = birthdaysInRange(new Date(2026, 6, 1), new Date(2026, 6, 4, 0, 0), members);
    expect(map.has('2026-07-04')).toBe(true);
  });

  it('is empty when nobody has a birthday set', () => {
    expect(birthdaysInRange(new Date(2026, 0, 1), new Date(2026, 11, 31), [member('Dee')]).size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { eventDate, isMealCalendar, mealTypeForCalendar } from './meal-calendars';

describe('meal calendars', () => {
  it('recognizes Mealie calendars only', () => {
    expect(isMealCalendar('calendar.mealie_dinner')).toBe(true);
    expect(isMealCalendar('calendar.family')).toBe(false);
  });

  it('maps calendar entity ids to meal types', () => {
    expect(mealTypeForCalendar('calendar.mealie_breakfast')).toBe('Breakfast');
    expect(mealTypeForCalendar('calendar.mealie_side')).toBe('Side');
    expect(mealTypeForCalendar('calendar.mealie_dessert')).toBe('Dessert');
    // Duplicate entity ids get a numeric suffix in HA.
    expect(mealTypeForCalendar('calendar.mealie_lunch_2')).toBe('Lunch');
    expect(mealTypeForCalendar('calendar.mealie_unknown')).toBe('Dinner');
  });

  it('reads the local date from all-day and timed events', () => {
    expect(eventDate('2026-10-10')).toBe('2026-10-10');
    expect(eventDate({ date: '2026-10-11' })).toBe('2026-10-11');
    const local = new Date(2026, 9, 12, 18, 30);
    expect(eventDate({ dateTime: local.toISOString() })).toBe('2026-10-12');
  });
});

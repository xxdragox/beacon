/**
 * Meal plans from Home Assistant calendars.
 *
 * HA's Mealie integration exposes one calendar per meal type
 * (calendar.mealie_breakfast, calendar.mealie_dinner, ...), with each planned
 * meal as an event. Beacon reads those as meal plan entries and keeps them out
 * of the family calendar views.
 */
import { haFetch } from './ha-rest';
import { MEAL_TYPE_ORDER, MealPlanEntry, MealType } from '../types/meals';

const MEAL_CALENDAR_PREFIX = 'calendar.mealie_';

export function isMealCalendar(entityId: string): boolean {
  return entityId.startsWith(MEAL_CALENDAR_PREFIX);
}

/** Meal type for a meal calendar, from its entity id (e.g. calendar.mealie_dinner → Dinner). */
export function mealTypeForCalendar(entityId: string): MealType {
  const suffix = entityId.slice(MEAL_CALENDAR_PREFIX.length).toLowerCase();
  return MEAL_TYPE_ORDER.find((type) => suffix.startsWith(type.toLowerCase())) ?? 'Dinner';
}

type HaCalendarEvent = {
  summary: string;
  start: string | { dateTime?: string; date?: string };
};

/** Local YYYY-MM-DD for an HA event start (all-day "2026-10-10" or a timestamp). */
export function eventDate(start: HaCalendarEvent['start']): string {
  const value = typeof start === 'string' ? start : (start.date ?? start.dateTime ?? '');
  if (value.length === 10) return value;
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Meal plan entries from every meal calendar in HA between `start` and `end` (ISO strings). */
export async function fetchMealCalendarEntries(start: string, end: string): Promise<MealPlanEntry[]> {
  const calendars = await haFetch('/api/calendars') as Array<{ entity_id: string }>;
  const params = new URLSearchParams({ start, end });
  const perCalendar = await Promise.all(
    (calendars || [])
      .filter((cal) => isMealCalendar(cal.entity_id))
      .map(async (cal) => {
        try {
          const events = await haFetch(`/api/calendars/${cal.entity_id}?${params}`) as HaCalendarEvent[];
          const mealType = mealTypeForCalendar(cal.entity_id);
          return (events || []).map((ev): MealPlanEntry => ({
            date: eventDate(ev.start),
            meal_type: mealType,
            name: ev.summary,
          }));
        } catch (err) {
          console.error(`Failed to fetch meals from ${cal.entity_id}:`, err);
          return [];
        }
      }),
  );
  return perCalendar.flat();
}

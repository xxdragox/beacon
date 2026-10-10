import { useState, useEffect, useMemo } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { loadData } from '../api/beacon-store';
import { fetchMealCalendarEntries } from '../api/meal-calendars';
import { hasToken } from '../api/ha-rest';
import { isAddOn } from '../utils/ha-env';
import { MEAL_TYPE_ORDER, MealPlanEntry, DayMenu } from '../types/meals';

const STORAGE_KEY = 'beacon_meal_plans';
const REFRESH_INTERVAL = 5 * 60 * 1000; // re-read sources every 5 min
const WEEK_DAYS = 7;

/** Local calendar date as YYYY-MM-DD (not UTC, which flips to tomorrow in the evening). */
const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');

function menuFor(entries: MealPlanEntry[], date: string): DayMenu {
  const meals = entries
    .filter((e) => e.date === date)
    .sort((a, b) => MEAL_TYPE_ORDER.indexOf(a.meal_type) - MEAL_TYPE_ORDER.indexOf(b.meal_type));
  return { date, meals };
}

/**
 * Meal plan entries from two sources:
 *  - the Beacon data store (written externally: MCP sync, CLI script, etc.)
 *  - Home Assistant meal calendars (Mealie integration), see ../api/meal-calendars
 */
export function useMealPlans() {
  const [storedEntries, setStoredEntries] = useState<MealPlanEntry[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<MealPlanEntry[]>([]);
  const [today, setToday] = useState(() => dateKey(new Date()));

  useEffect(() => {
    const load = () => {
      setToday(dateKey(new Date()));
      loadData<MealPlanEntry[]>(STORAGE_KEY, []).then(setStoredEntries);
      if (isAddOn() || hasToken()) {
        const start = startOfDay(new Date());
        fetchMealCalendarEntries(start.toISOString(), addDays(start, WEEK_DAYS).toISOString())
          .then(setCalendarEntries)
          .catch((err) => console.error('Failed to fetch meal calendars:', err));
      }
    };
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const entries = useMemo(() => [...storedEntries, ...calendarEntries], [storedEntries, calendarEntries]);

  const todaysMenu = useMemo(() => menuFor(entries, today), [entries, today]);

  /** Today plus the next six days. */
  const weekMenu = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    const first = new Date(y, m - 1, d);
    return Array.from({ length: WEEK_DAYS }, (_, i) => menuFor(entries, dateKey(addDays(first, i))));
  }, [entries, today]);

  return { entries, todaysMenu, weekMenu };
}

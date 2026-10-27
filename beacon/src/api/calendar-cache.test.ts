// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Server-side module (runs in the add-on's Node server, not the browser).
const { createCalendarCache } = require('../../calendar-cache.cjs');

const TZ = 'America/New_York';
const NOW = Date.parse('2026-10-27T15:00:00-04:00');
const quiet = { info: () => {}, warn: () => {} };

const EVENTS = [
  { summary: 'Dentist', start: { dateTime: '2026-10-28T09:00:00-04:00' }, end: { dateTime: '2026-10-28T10:00:00-04:00' }, uid: 'a' },
  { summary: 'Trip', start: { date: '2026-10-30' }, end: { date: '2026-11-02' }, uid: 'b' },
  { summary: 'Next month', start: { dateTime: '2026-11-20T18:00:00-05:00' }, end: { dateTime: '2026-11-20T19:00:00-05:00' }, uid: 'c' },
];

function makeCache(overrides: Record<string, unknown> = {}) {
  const fetchEvents = vi.fn(async () => EVENTS);
  const cache = createCalendarCache({
    fetchEvents,
    getTimeZone: () => TZ,
    now: () => NOW,
    log: quiet,
    ...overrides,
  });
  return { cache, fetchEvents };
}

describe('calendar cache', () => {
  it('passes the first request through and caches the calendar for the next one', async () => {
    const { cache, fetchEvents } = makeCache();
    expect(cache.get('calendar.family', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00')).toBeNull();
    await cache.refresh('calendar.family');
    expect(fetchEvents).toHaveBeenCalledTimes(1);
    const [, start, end] = fetchEvents.mock.calls[0] as unknown as [string, string, string];
    // Window: ~62 days back to ~190 days ahead, on local midnights.
    expect(new Date(start).toISOString()).toBe('2026-08-26T04:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2027-05-05T04:00:00.000Z');

    const hit = cache.get('calendar.family', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00');
    expect(hit.events.map((e: { uid: string }) => e.uid)).toEqual(['a', 'b']);
  });

  it('filters by overlap, treating all-day dates as local midnights', async () => {
    const { cache } = makeCache();
    await cache.refresh('calendar.family');
    const uids = (s: string, e: string) => cache.get('calendar.family', s, e).events.map((x: { uid: string }) => x.uid);
    // The day before the trip, in UTC terms ending 04:00Z on the 30th: trip not included.
    expect(uids('2026-10-29T00:00:00-04:00', '2026-10-30T00:00:00-04:00')).toEqual([]);
    // Last day of the trip (end date is exclusive).
    expect(uids('2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-05:00')).toEqual(['b']);
    expect(uids('2026-11-02T00:00:00-05:00', '2026-11-03T00:00:00-05:00')).toEqual([]);
    // Event exactly touching the range edge is excluded.
    expect(uids('2026-10-28T10:00:00-04:00', '2026-10-28T12:00:00-04:00')).toEqual([]);
  });

  it('passes through requests that reach outside the cached window', async () => {
    const { cache } = makeCache();
    await cache.refresh('calendar.family');
    expect(cache.get('calendar.family', '2027-06-01T00:00:00-04:00', '2027-07-01T00:00:00-04:00')).toBeNull();
  });

  it('keeps serving the previous copy when a refresh fails', async () => {
    const { cache, fetchEvents } = makeCache();
    await cache.refresh('calendar.family');
    fetchEvents.mockRejectedValueOnce(new Error('iCloud down'));
    await expect(cache.refresh('calendar.family')).rejects.toThrow('iCloud down');
    expect(cache.get('calendar.family', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00').events).toHaveLength(2);
  });

  it('refetches only calendars whose change tag moved', async () => {
    let tags = new Map([['calendar.family', 't1'], ['calendar.kim', 'k1']]);
    const { cache, fetchEvents } = makeCache({ getChangeTags: async () => tags });
    cache.get('calendar.family', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00');
    cache.get('calendar.kim', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00');
    await cache.poll();
    fetchEvents.mockClear();

    await cache.poll();
    expect(fetchEvents).not.toHaveBeenCalled();

    tags = new Map([['calendar.family', 't2'], ['calendar.kim', 'k1']]);
    await cache.poll();
    expect(fetchEvents.mock.calls.map((c) => (c as unknown as string[])[0])).toEqual(['calendar.family']);
  });

  it('refetches untagged calendars once they are old enough', async () => {
    let clock = NOW;
    const { cache, fetchEvents } = makeCache({ now: () => clock, getChangeTags: async () => new Map() });
    cache.get('calendar.ses', '2026-10-25T00:00:00-04:00', '2026-11-01T00:00:00-04:00');
    await cache.poll();
    fetchEvents.mockClear();

    clock += 5 * 60 * 1000;
    await cache.poll();
    expect(fetchEvents).not.toHaveBeenCalled();

    clock += 15 * 60 * 1000;
    await cache.poll();
    expect(fetchEvents).toHaveBeenCalledTimes(1);
  });

  it('shares one fetch between concurrent refreshes of the same calendar', async () => {
    const { cache, fetchEvents } = makeCache();
    await Promise.all([cache.refresh('calendar.family'), cache.refresh('calendar.family')]);
    expect(fetchEvents).toHaveBeenCalledTimes(1);
  });
});

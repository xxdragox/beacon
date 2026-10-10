// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Server-side module (runs in the add-on's Node server, not the browser).
const { applyEventUpdate, applyEventDelete, parseDateTime, wallTimeToEpoch, createClient } = require('../../icloud-caldav.cjs');

const TZ = 'America/New_York';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function ics(...vevents: string[][]) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//iOS 26.0//EN', 'CALSCALE:GREGORIAN', ...VTIMEZONE, ...vevents.flat(), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

const SINGLE = ics([
  'BEGIN:VEVENT',
  'UID:CA0D42CD-E3CA-40F0-B940-4130CFD91AC5',
  'DTSTAMP:20261001T120000Z',
  'DTSTART;TZID=America/New_York:20261012T180000',
  'DTEND;TZID=America/New_York:20261012T190000',
  'SUMMARY:Soccer practice',
  'LOCATION:Field 3',
  'SEQUENCE:2',
  'X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC',
  'END:VEVENT',
]);

const ALL_DAY = ics([
  'BEGIN:VEVENT',
  'UID:allday-1',
  'DTSTAMP:20261001T120000Z',
  'DTSTART;VALUE=DATE:20261015',
  'DTEND;VALUE=DATE:20261016',
  'SUMMARY:Teacher workday',
  'END:VEVENT',
]);

const SERIES = ics([
  'BEGIN:VEVENT',
  'UID:f7eaceda-b96c-11f1-951e-da6299152b4d',
  'DTSTAMP:20260901T120000Z',
  'DTSTART;TZID=America/New_York:20260927T113000',
  'DTEND;TZID=America/New_York:20260927T123000',
  'RRULE:FREQ=WEEKLY',
  'SUMMARY:Church',
  'SEQUENCE:0',
  'END:VEVENT',
]);

/** Unfolded content lines of a VEVENT whose UID/RECURRENCE-ID matches. */
function lines(text: string) {
  return text.replace(/\r\n[ \t]/g, '').split(/\r\n/);
}

describe('time helpers', () => {
  it('converts wall time in a zone to an instant across DST', () => {
    expect(new Date(wallTimeToEpoch({ year: 2026, month: 10, day: 12, hour: 18, minute: 0 }, TZ)).toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(new Date(wallTimeToEpoch({ year: 2026, month: 12, day: 12, hour: 18, minute: 0 }, TZ)).toISOString()).toBe('2026-12-12T23:00:00.000Z');
  });

  it('parses Beacon and HA date formats', () => {
    expect(parseDateTime('2026-10-15', TZ)).toEqual({ isDate: true, date: { year: 2026, month: 10, day: 15 } });
    expect(parseDateTime('2026-10-12T18:30:00', TZ).epoch).toBe(Date.parse('2026-10-12T22:30:00Z'));
    expect(parseDateTime('2026-09-27 11:30:00-04:00', TZ).epoch).toBe(Date.parse('2026-09-27T15:30:00Z'));
  });
});

describe('applyEventUpdate', () => {
  it('edits a single event in its own time zone and keeps Apple properties', () => {
    const out = applyEventUpdate(SINGLE, {
      payload: { summary: 'Soccer game', dtstart: '2026-10-13T17:00:00', dtend: '2026-10-13T18:30:00' },
      defaultTz: TZ,
    });
    const l = lines(out);
    expect(l).toContain('SUMMARY:Soccer game');
    expect(l).toContain('DTSTART;TZID=America/New_York:20261013T170000');
    expect(l).toContain('DTEND;TZID=America/New_York:20261013T183000');
    expect(l).toContain('LOCATION:Field 3');
    expect(l).toContain('X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC');
    expect(l).toContain('SEQUENCE:3');
    expect(l).toContain('BEGIN:VTIMEZONE');
  });

  it('keeps the duration when only the start moves (drag to reschedule)', () => {
    const l = lines(applyEventUpdate(SINGLE, { payload: { dtstart: '2026-10-14T09:00:00' }, defaultTz: TZ }));
    expect(l).toContain('DTSTART;TZID=America/New_York:20261014T090000');
    expect(l).toContain('DTEND;TZID=America/New_York:20261014T100000');
  });

  it('edits all-day events as dates', () => {
    const l = lines(applyEventUpdate(ALL_DAY, { payload: { dtstart: '2026-10-16', dtend: '2026-10-17' }, defaultTz: TZ }));
    expect(l).toContain('DTSTART;VALUE=DATE:20261016');
    expect(l).toContain('DTEND;VALUE=DATE:20261017');
  });

  it('writes an all-day event switched to timed in UTC', () => {
    const l = lines(applyEventUpdate(ALL_DAY, { payload: { dtstart: '2026-10-15T08:00:00', dtend: '2026-10-15T09:00:00' }, defaultTz: TZ }));
    expect(l).toContain('DTSTART:20261015T120000Z');
    expect(l).toContain('DTEND:20261015T130000Z');
  });

  it('turns an occurrence edit into an override and leaves the series alone', () => {
    const out = applyEventUpdate(SERIES, {
      payload: { summary: 'Church (late service)', dtstart: '2026-10-11T17:00:00', dtend: '2026-10-11T18:00:00' },
      recurrenceId: '2026-10-11 11:30:00-04:00',
      defaultTz: TZ,
    });
    const l = lines(out);
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(l).toContain('RRULE:FREQ=WEEKLY');
    expect(l).toContain('SUMMARY:Church');
    expect(l).toContain('DTSTART;TZID=America/New_York:20260927T113000');
    expect(l).toContain('RECURRENCE-ID;TZID=America/New_York:20261011T113000');
    expect(l).toContain('SUMMARY:Church (late service)');
    expect(l).toContain('DTSTART;TZID=America/New_York:20261011T170000');
    // Only the series repeats (the VTIMEZONE's own RRULEs don't count).
    expect(l.filter((x) => x === 'RRULE:FREQ=WEEKLY')).toHaveLength(1);
  });

  it('updates an existing override instead of adding another', () => {
    const once = applyEventUpdate(SERIES, { payload: { summary: 'A' }, recurrenceId: '2026-10-11 11:30:00-04:00', defaultTz: TZ });
    const twice = applyEventUpdate(once, { payload: { summary: 'B' }, recurrenceId: '2026-10-11 11:30:00-04:00', defaultTz: TZ });
    const l = lines(twice);
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(l).toContain('SUMMARY:B');
    expect(l).not.toContain('SUMMARY:A');
  });

  it('refuses to rewrite a whole series without an occurrence', () => {
    expect(() => applyEventUpdate(SERIES, { payload: { summary: 'x' }, defaultTz: TZ })).toThrow(/one occurrence/);
  });
});

describe('applyEventDelete', () => {
  it('deletes a single event outright', () => {
    expect(applyEventDelete(SINGLE, { defaultTz: TZ })).toBeNull();
  });

  it('removes one occurrence of a series with an EXDATE', () => {
    const l = lines(applyEventDelete(SERIES, { recurrenceId: '2026-10-04 11:30:00-04:00', defaultTz: TZ }));
    expect(l).toContain('EXDATE;TZID=America/New_York:20261004T113000');
    expect(l).toContain('RRULE:FREQ=WEEKLY');
  });

  it('drops an existing override for the deleted occurrence', () => {
    const edited = applyEventUpdate(SERIES, { payload: { summary: 'Moved' }, recurrenceId: '2026-10-11 11:30:00-04:00', defaultTz: TZ });
    const l = lines(applyEventDelete(edited, { recurrenceId: '2026-10-11 11:30:00-04:00', defaultTz: TZ }));
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(l).toContain('EXDATE;TZID=America/New_York:20261011T113000');
  });

  it('refuses to delete a whole series without an occurrence', () => {
    expect(() => applyEventDelete(SERIES, { defaultTz: TZ })).toThrow(/one occurrence/);
  });
});

describe('CalDAV client (mocked iCloud)', () => {
  function mockICloud(handler: (method: string, url: string, init: RequestInit) => Response | undefined) {
    const calls: Array<{ method: string; url: string; headers: Record<string, string>; body?: string }> = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ method: init.method as string, url, headers, body: init.body as string });
      return handler(init.method as string, url, init) ?? new Response('', { status: 404 });
    };
    return { calls, fetchImpl };
  }

  const multistatus = (inner: string) => new Response(`<?xml version="1.0"?><multistatus xmlns="DAV:">${inner}</multistatus>`, { status: 207 });

  it('discovers calendars across the iCloud redirect, finds the event, and PUTs with If-Match', async () => {
    const { calls, fetchImpl } = mockICloud((method, url) => {
      if (url === 'https://caldav.icloud.com/') return new Response('', { status: 301, headers: { location: 'https://p52-caldav.icloud.com/' } });
      if (url === 'https://p52-caldav.icloud.com/' && method === 'PROPFIND') {
        return multistatus('<response><href>/</href><propstat><prop><current-user-principal><href>/123/principal/</href></current-user-principal></prop></propstat></response>');
      }
      if (url.endsWith('/123/principal/')) {
        return multistatus('<response><href>/123/principal/</href><propstat><prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p52-caldav.icloud.com:443/123/calendars/</href></calendar-home-set></prop></propstat></response>');
      }
      if (url.endsWith('/123/calendars/') && method === 'PROPFIND') {
        return multistatus(
          '<response><href>/123/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>' +
          '<response><href>/123/calendars/home/</href><propstat><prop><displayname>Family</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response>',
        );
      }
      if (method === 'REPORT') {
        return multistatus(`<response><href>/123/calendars/home/CA0D42CD.ics</href><propstat><prop><getetag>"etag-1"</getetag><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">${SINGLE.replace(/&/g, '&amp;')}</calendar-data></prop></propstat></response>`);
      }
      if (method === 'PUT') return new Response(null, { status: 204 });
      return undefined;
    });

    const client = createClient({ username: 'me@icloud.com', password: 'abcd-efgh-ijkl-mnop', fetchImpl });
    await client.updateEvent({
      calendarName: 'family',
      uid: 'CA0D42CD-E3CA-40F0-B940-4130CFD91AC5',
      payload: { summary: 'Soccer game' },
      defaultTz: TZ,
    });

    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('https://p52-caldav.icloud.com/123/calendars/home/CA0D42CD.ics');
    expect(put.headers['If-Match']).toBe('"etag-1"');
    expect(put.headers.Authorization).toMatch(/^Basic /);
    expect(put.body).toContain('SUMMARY:Soccer game');
    // Auth survived the cross-host redirect.
    expect(calls.every((c) => c.headers.Authorization)).toBe(true);
  });

  it('reports a non-iCloud calendar distinctly', async () => {
    const { fetchImpl } = mockICloud((method, url) => {
      if (url === 'https://caldav.icloud.com/') return multistatus('<response><propstat><prop><current-user-principal><href>/1/principal/</href></current-user-principal></prop></propstat></response>');
      if (url.endsWith('/1/principal/')) return multistatus('<response><propstat><prop><calendar-home-set><href>/1/calendars/</href></calendar-home-set></prop></propstat></response>');
      if (url.endsWith('/1/calendars/')) return multistatus('');
      return undefined;
    });
    const client = createClient({ username: 'u', password: 'p', fetchImpl });
    await expect(client.deleteEvent({ calendarName: 'SES', uid: 'x', defaultTz: TZ })).rejects.toMatchObject({ code: 'not_icloud_calendar' });
  });

  it('turns a 412 into a clear conflict error', async () => {
    const { fetchImpl } = mockICloud((method, url) => {
      if (url === 'https://caldav.icloud.com/') return multistatus('<response><propstat><prop><current-user-principal><href>/1/principal/</href></current-user-principal></prop></propstat></response>');
      if (url.endsWith('/1/principal/')) return multistatus('<response><propstat><prop><calendar-home-set><href>/1/calendars/</href></calendar-home-set></prop></propstat></response>');
      if (url.endsWith('/1/calendars/')) return multistatus('<response><href>/1/calendars/fam/</href><propstat><prop><displayname>Family</displayname><resourcetype><calendar/></resourcetype></prop></propstat></response>');
      if (method === 'REPORT') return multistatus(`<response><href>/1/calendars/fam/a.ics</href><propstat><prop><getetag>"e"</getetag><calendar-data>${SINGLE}</calendar-data></prop></propstat></response>`);
      if (method === 'DELETE') return new Response('', { status: 412 });
      return undefined;
    });
    const client = createClient({ username: 'u', password: 'p', fetchImpl });
    await expect(client.deleteEvent({ calendarName: 'Family', uid: 'CA0D42CD-E3CA-40F0-B940-4130CFD91AC5', defaultTz: TZ }))
      .rejects.toMatchObject({ code: 'icloud_conflict' });
  });
});

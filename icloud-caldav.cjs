/**
 * iCloud CalDAV fallback for calendar event updates and deletes.
 *
 * Home Assistant's CalDAV integration can only create events, so Beacon
 * edits/deletes events on iCloud calendars by talking to iCloud directly.
 * Events are still read (and created) through Home Assistant; this module
 * only finds an existing event by its UID and rewrites or removes it.
 *
 * Credentials come from the add-on options (icloud_username and an Apple
 * app-specific password) and never leave the server.
 *
 * Recurring events: HA reports each occurrence with a `recurrence_id`. An
 * update with one becomes a single-occurrence override (RECURRENCE-ID), and
 * a delete with one becomes an EXDATE on the series, like Apple Calendar's
 * "this event only". The series itself is never rewritten from an occurrence.
 */
const ICAL = require('ical.js');

const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com/';
const CALENDAR_CACHE_MS = 10 * 60 * 1000;

class ICloudError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// ─── Time zone helpers (Intl, so any IANA TZID works without a VTIMEZONE) ───

function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in `tz`. */
function zonedParts(epochMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Instant for a wall-clock time in `tz`. */
function wallTimeToEpoch({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetAt = (epoch) => {
    const p = zonedParts(epoch, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - epoch;
  };
  let epoch = asUtc - offsetAt(asUtc);
  epoch = asUtc - offsetAt(epoch); // second pass settles DST transitions
  return epoch;
}

/**
 * Parse a date/time string from Beacon or HA:
 *   "2026-10-10"                    → all-day date
 *   "2026-10-10T18:30:00"           → wall time in `tz`
 *   "2026-10-10 18:30:00-04:00"     → absolute (HA recurrence_id style)
 *   "2026-10-10T22:30:00Z"          → absolute
 */
function parseDateTime(value, tz) {
  const s = String(value).trim().replace(' ', 'T');
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (date) {
    return { isDate: true, date: { year: +date[1], month: +date[2], day: +date[3] } };
  }
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const epoch = Date.parse(s);
    if (Number.isNaN(epoch)) throw new ICloudError(`Invalid date/time: ${value}`, 'bad_request');
    return { isDate: false, epoch };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) throw new ICloudError(`Invalid date/time: ${value}`, 'bad_request');
  return {
    isDate: false,
    epoch: wallTimeToEpoch({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] || 0) }, tz),
  };
}

// ─── iCal property helpers ───

/**
 * How an existing DTSTART-like property expresses time, so replacements are
 * written the same way: { kind: 'date' } | { kind: 'utc' } |
 * { kind: 'tzid', tzid } | { kind: 'floating' }.
 */
function timeStyleOf(prop, defaultTz) {
  if (!prop) return { kind: 'utc' };
  if (prop.type === 'date') return { kind: 'date' };
  const tzid = prop.getParameter('tzid');
  if (tzid) return isValidTimeZone(tzid) ? { kind: 'tzid', tzid } : { kind: 'utc' };
  const raw = prop.toICALString();
  if (/Z$/i.test(raw)) return { kind: 'utc' };
  return isValidTimeZone(defaultTz) ? { kind: 'floating' } : { kind: 'utc' };
}

/** Instant (or date) a DTSTART/DTEND/RECURRENCE-ID property refers to. */
function propMoment(prop, defaultTz) {
  const style = timeStyleOf(prop, defaultTz);
  const t = prop.getFirstValue();
  if (style.kind === 'date') return { isDate: true, date: { year: t.year, month: t.month, day: t.day } };
  const wall = { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second };
  if (style.kind === 'utc') return { isDate: false, epoch: Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) };
  return { isDate: false, epoch: wallTimeToEpoch(wall, style.kind === 'tzid' ? style.tzid : defaultTz) };
}

function sameMoment(a, b) {
  if (a.isDate || b.isDate) {
    const da = a.isDate ? a.date : null;
    const db = b.isDate ? b.date : null;
    if (da && db) return da.year === db.year && da.month === db.month && da.day === db.day;
    return false;
  }
  return Math.abs(a.epoch - b.epoch) < 1000;
}

/**
 * Build a date or date-time property for `moment`, written in `style`
 * (which comes from the series/event being edited).
 */
function buildTimeProp(name, moment, style, defaultTz) {
  const prop = new ICAL.Property(name);
  if (moment.isDate) {
    prop.resetType('date');
    prop.setValue(ICAL.Time.fromData({ ...moment.date, isDate: true }));
    return prop;
  }
  prop.resetType('date-time');
  if (style.kind === 'tzid' || style.kind === 'floating') {
    const tz = style.kind === 'tzid' ? style.tzid : defaultTz;
    prop.setValue(ICAL.Time.fromData({ ...zonedParts(moment.epoch, tz), isDate: false }));
    if (style.kind === 'tzid') prop.setParameter('tzid', style.tzid);
    return prop;
  }
  const p = zonedParts(moment.epoch, 'UTC');
  prop.setValue(ICAL.Time.fromData({ ...p, isDate: false }, ICAL.Timezone.utcTimezone));
  return prop;
}

function replaceProp(component, prop) {
  component.removeAllProperties(prop.name);
  component.addProperty(prop);
}

function utcNowProp(name) {
  return buildTimeProp(name, { isDate: false, epoch: Date.now() }, { kind: 'utc' });
}

function bumpSequence(vevent) {
  const seq = Number(vevent.getFirstPropertyValue('sequence')) || 0;
  vevent.updatePropertyWithValue('sequence', seq + 1);
  replaceProp(vevent, utcNowProp('dtstamp'));
  replaceProp(vevent, utcNowProp('last-modified'));
}

/** Duration of a VEVENT in ms (dates count whole days). */
function eventDurationMs(vevent, defaultTz) {
  const startProp = vevent.getFirstProperty('dtstart');
  const start = propMoment(startProp, defaultTz);
  const endProp = vevent.getFirstProperty('dtend');
  if (endProp) {
    const end = propMoment(endProp, defaultTz);
    if (start.isDate && end.isDate) {
      return Date.UTC(end.date.year, end.date.month - 1, end.date.day) - Date.UTC(start.date.year, start.date.month - 1, start.date.day);
    }
    if (!start.isDate && !end.isDate) return end.epoch - start.epoch;
  }
  const duration = vevent.getFirstPropertyValue('duration');
  if (duration) return duration.toSeconds() * 1000;
  return start.isDate ? 24 * 3600 * 1000 : 0;
}

function addMs(moment, ms) {
  if (moment.isDate) {
    const d = new Date(Date.UTC(moment.date.year, moment.date.month - 1, moment.date.day) + ms);
    return { isDate: true, date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() } };
  }
  return { isDate: false, epoch: moment.epoch + ms };
}

function splitEvents(vcalendar) {
  const vevents = vcalendar.getAllSubcomponents('vevent');
  const master = vevents.find((v) => !v.hasProperty('recurrence-id')) || null;
  const overrides = vevents.filter((v) => v.hasProperty('recurrence-id'));
  return { master, overrides };
}

function findOverride(overrides, occurrence, defaultTz) {
  return overrides.find((v) => sameMoment(propMoment(v.getFirstProperty('recurrence-id'), defaultTz), occurrence)) || null;
}

/** An occurrence's original start, as a moment matching the series' DTSTART kind. */
function occurrenceMoment(recurrenceId, master, defaultTz) {
  const parsed = parseDateTime(recurrenceId, defaultTz);
  const masterIsDate = master.getFirstProperty('dtstart').type === 'date';
  if (masterIsDate && !parsed.isDate) {
    const p = zonedParts(parsed.epoch, defaultTz);
    return { isDate: true, date: { year: p.year, month: p.month, day: p.day } };
  }
  return parsed;
}

const COPY_EXCLUDE = new Set(['rrule', 'rdate', 'exdate', 'exrule', 'dtstart', 'dtend', 'duration', 'recurrence-id', 'sequence', 'dtstamp', 'last-modified']);

// ─── Pure edits on iCalendar text ───

/**
 * Apply a Beacon/HA-style update payload ({ summary, description, location,
 * dtstart, dtend, rrule }) to an iCalendar object. With `recurrenceId`, only
 * that occurrence changes. Returns the new iCalendar text.
 */
function applyEventUpdate(icsText, { payload, recurrenceId, defaultTz }) {
  const vcalendar = new ICAL.Component(ICAL.parse(icsText));
  const { master, overrides } = splitEvents(vcalendar);
  if (!master) throw new ICloudError('Event data has no VEVENT', 'bad_event');
  const isSeries = master.hasProperty('rrule') || master.hasProperty('rdate');

  let target;
  if (recurrenceId && isSeries) {
    const occurrence = occurrenceMoment(recurrenceId, master, defaultTz);
    target = findOverride(overrides, occurrence, defaultTz);
    if (!target) {
      // New single-occurrence override: copy the series, pinned to this date.
      target = new ICAL.Component('vevent');
      for (const prop of master.getAllProperties()) {
        if (!COPY_EXCLUDE.has(prop.name)) target.addProperty(ICAL.Property.fromString(prop.toICALString()));
      }
      const style = timeStyleOf(master.getFirstProperty('dtstart'), defaultTz);
      target.addProperty(buildTimeProp('recurrence-id', occurrence, style, defaultTz));
      target.addProperty(buildTimeProp('dtstart', occurrence, style, defaultTz));
      target.addProperty(buildTimeProp('dtend', addMs(occurrence, eventDurationMs(master, defaultTz)), style, defaultTz));
      target.updatePropertyWithValue('sequence', Number(master.getFirstPropertyValue('sequence')) || 0);
      vcalendar.addSubcomponent(target);
    }
  } else if (isSeries) {
    throw new ICloudError('Recurring events can only be edited one occurrence at a time.', 'recurring_needs_occurrence');
  } else {
    target = master;
  }

  for (const key of ['summary', 'description', 'location']) {
    if (payload[key] !== undefined) {
      if (payload[key] === '' || payload[key] === null) target.removeAllProperties(key);
      else target.updatePropertyWithValue(key, String(payload[key]));
    }
  }

  if (payload.dtstart !== undefined || payload.dtend !== undefined) {
    const oldStartProp = target.getFirstProperty('dtstart');
    const oldDuration = eventDurationMs(target, defaultTz);
    const start = payload.dtstart !== undefined ? parseDateTime(payload.dtstart, defaultTz) : propMoment(oldStartProp, defaultTz);
    let end = payload.dtend !== undefined ? parseDateTime(payload.dtend, defaultTz) : null;
    if (!end || end.isDate !== start.isDate) {
      end = addMs(start, start.isDate ? Math.max(oldDuration, 24 * 3600 * 1000) : oldDuration);
    }
    // Keep the event's own time zone. Switching an all-day event to timed
    // has no zone to inherit, so it's written in UTC (always valid).
    let style = timeStyleOf(oldStartProp, defaultTz);
    if (style.kind === 'date') style = { kind: 'utc' };
    target.removeAllProperties('duration');
    replaceProp(target, buildTimeProp('dtstart', start, style, defaultTz));
    replaceProp(target, buildTimeProp('dtend', end, style, defaultTz));
  }

  if (payload.rrule !== undefined && target === master) {
    if (payload.rrule) replaceProp(target, new ICAL.Property(['rrule', {}, 'recur', ICAL.Recur.fromString(payload.rrule).toJSON()]));
    else target.removeAllProperties('rrule');
  }

  bumpSequence(target);
  return vcalendar.toString();
}

/**
 * Delete an event. With `recurrenceId`, only that occurrence is removed (an
 * EXDATE on the series) and the new iCalendar text is returned. Otherwise
 * returns null, meaning the whole resource should be deleted.
 */
function applyEventDelete(icsText, { recurrenceId, defaultTz }) {
  const vcalendar = new ICAL.Component(ICAL.parse(icsText));
  const { master, overrides } = splitEvents(vcalendar);
  if (!master) throw new ICloudError('Event data has no VEVENT', 'bad_event');
  const isSeries = master.hasProperty('rrule') || master.hasProperty('rdate');

  if (!isSeries) return null;
  if (!recurrenceId) {
    throw new ICloudError('Recurring events can only be deleted one occurrence at a time.', 'recurring_needs_occurrence');
  }

  const occurrence = occurrenceMoment(recurrenceId, master, defaultTz);
  const override = findOverride(overrides, occurrence, defaultTz);
  if (override) vcalendar.removeSubcomponent(override);
  const style = timeStyleOf(master.getFirstProperty('dtstart'), defaultTz);
  master.addProperty(buildTimeProp('exdate', occurrence, style, defaultTz));
  bumpSequence(master);
  return vcalendar.toString();
}

// ─── CalDAV transport ───

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function xmlUnescape(s) {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Text content of the first element named `localName` (any namespace prefix). */
function xmlText(xml, localName) {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${localName}>`, 'i');
  const m = re.exec(xml);
  return m ? xmlUnescape(m[1].trim()) : null;
}

function xmlResponses(xml) {
  const re = /<(?:[\w-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function createClient({ username, password, fetchImpl = fetch }) {
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  let calendarCache = null;
  let homeUrl = null;

  /**
   * CalDAV request that follows iCloud's cross-host redirects (e.g. to
   * pNN-caldav.icloud.com) itself, since fetch drops Authorization on a
   * cross-origin redirect.
   */
  async function request(method, url, { body, headers = {}, depth } = {}) {
    let target = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetchImpl(target, {
        method,
        redirect: 'manual',
        headers: {
          Authorization: auth,
          ...(body ? { 'Content-Type': headers['Content-Type'] || 'application/xml; charset=utf-8' } : {}),
          ...(depth !== undefined ? { Depth: String(depth) } : {}),
          ...headers,
        },
        body,
      });
      if ([301, 302, 307, 308].includes(res.status) && res.headers.get('location')) {
        target = new URL(res.headers.get('location'), target).toString();
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new ICloudError('iCloud rejected the Apple ID or app-specific password.', 'icloud_auth');
      }
      return { res, url: target };
    }
    throw new ICloudError('Too many redirects from iCloud.', 'icloud_error');
  }

  async function propfind(url, depth, props) {
    const body = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/"><d:prop>${props}</d:prop></d:propfind>`;
    const { res, url: finalUrl } = await request('PROPFIND', url, { body, depth });
    if (res.status !== 207) throw new ICloudError(`iCloud PROPFIND failed (HTTP ${res.status}).`, 'icloud_error');
    return { xml: await res.text(), url: finalUrl };
  }

  /** All iCloud calendars as [{ name, url }], cached for a few minutes. */
  /** The account's calendar-home URL (it never changes, so it's looked up once). */
  async function calendarHomeUrl() {
    if (homeUrl) return homeUrl;
    const root = await propfind(ICLOUD_CALDAV_URL, 0, '<d:current-user-principal/>');
    const principalHref = xmlText(xmlText(root.xml, 'current-user-principal') || '', 'href');
    if (!principalHref) throw new ICloudError('Could not find the iCloud calendar account.', 'icloud_error');
    const principal = await propfind(new URL(principalHref, root.url).toString(), 0, '<c:calendar-home-set/>');
    const homeHref = xmlText(xmlText(principal.xml, 'calendar-home-set') || '', 'href');
    if (!homeHref) throw new ICloudError('Could not find the iCloud calendar home.', 'icloud_error');
    homeUrl = new URL(homeHref, principal.url).toString();
    return homeUrl;
  }

  /** Calendars in the home as [{ name, url, ctag }] — one PROPFIND, never cached. */
  async function fetchCalendars() {
    const home = await propfind(await calendarHomeUrl(), 1, '<d:displayname/><d:resourcetype/><cs:getctag/>');
    return xmlResponses(home.xml)
      .filter((r) => /<(?:[\w-]+:)?calendar[\s/>]/i.test(xmlText(r, 'resourcetype') || ''))
      .map((r) => ({
        name: xmlText(r, 'displayname') || '',
        url: new URL(xmlText(r, 'href'), home.url).toString(),
        ctag: xmlText(r, 'getctag') || null,
      }))
      .filter((c) => c.name);
  }

  async function listCalendars() {
    if (calendarCache && Date.now() - calendarCache.at < CALENDAR_CACHE_MS) return calendarCache.calendars;
    const calendars = await fetchCalendars();
    calendarCache = { at: Date.now(), calendars };
    return calendars;
  }

  /**
   * Each calendar's change tag (CalendarServer getctag), keyed by lower-cased,
   * trimmed calendar name. A calendar's tag changes whenever any event in it
   * does, so comparing tags is a cheap "has anything changed?" check.
   */
  async function listChangeTags() {
    const calendars = await fetchCalendars();
    calendarCache = { at: Date.now(), calendars };
    return new Map(calendars.map((c) => [c.name.trim().toLowerCase(), c.ctag]));
  }

  async function findCalendarByName(name) {
    const wanted = String(name).trim().toLowerCase();
    const calendars = await listCalendars();
    return calendars.find((c) => c.name.trim().toLowerCase() === wanted) || null;
  }

  /** The calendar object holding the event with `uid`: { href, etag, ics }. */
  async function findEvent(calendarUrl, uid) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:prop-filter name="UID"><c:text-match collation="i;octet">${xmlEscape(uid)}</c:text-match></c:prop-filter>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
    const { res, url } = await request('REPORT', calendarUrl, { body, depth: 1 });
    if (res.status === 207) {
      for (const r of xmlResponses(await res.text())) {
        const ics = xmlText(r, 'calendar-data');
        if (ics && ics.includes(uid)) {
          return { href: new URL(xmlText(r, 'href'), url).toString(), etag: xmlText(r, 'getetag'), ics };
        }
      }
    }
    // Fallback: Apple usually stores events as <UID>.ics.
    const direct = await request('GET', new URL(`${encodeURIComponent(uid)}.ics`, calendarUrl).toString());
    if (direct.res.status === 200) {
      return { href: direct.url, etag: direct.res.headers.get('etag'), ics: await direct.res.text() };
    }
    throw new ICloudError('Could not find this event in iCloud. It may have been changed or deleted elsewhere — reload and try again.', 'icloud_not_found');
  }

  function checkWrite(res, action) {
    if (res.status === 412) {
      throw new ICloudError('This event was changed on another device. Reload and try again.', 'icloud_conflict');
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ICloudError(`iCloud refused to ${action} the event (HTTP ${res.status}).`, 'icloud_error');
    }
  }

  async function updateEvent({ calendarName, uid, recurrenceId, payload, defaultTz }) {
    const calendar = await findCalendarByName(calendarName);
    if (!calendar) throw new ICloudError(`"${calendarName}" is not an iCloud calendar.`, 'not_icloud_calendar');
    const found = await findEvent(calendar.url, uid);
    const ics = applyEventUpdate(found.ics, { payload, recurrenceId, defaultTz });
    const { res } = await request('PUT', found.href, {
      body: ics,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...(found.etag ? { 'If-Match': found.etag } : {}) },
    });
    checkWrite(res, 'update');
  }

  async function deleteEvent({ calendarName, uid, recurrenceId, defaultTz }) {
    const calendar = await findCalendarByName(calendarName);
    if (!calendar) throw new ICloudError(`"${calendarName}" is not an iCloud calendar.`, 'not_icloud_calendar');
    const found = await findEvent(calendar.url, uid);
    const ics = applyEventDelete(found.ics, { recurrenceId, defaultTz });
    const ifMatch = found.etag ? { 'If-Match': found.etag } : {};
    const { res } = ics === null
      ? await request('DELETE', found.href, { headers: ifMatch })
      : await request('PUT', found.href, { body: ics, headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...ifMatch } });
    checkWrite(res, 'delete');
  }

  return { listCalendars, listChangeTags, findCalendarByName, updateEvent, deleteEvent };
}

module.exports = {
  ICloudError,
  createClient,
  applyEventUpdate,
  applyEventDelete,
  parseDateTime,
  wallTimeToEpoch,
  zonedParts,
};

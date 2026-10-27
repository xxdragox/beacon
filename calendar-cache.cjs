/**
 * Server-side calendar event cache for the add-on.
 *
 * Every screen asks for events through the add-on's /api proxy, and HA's
 * CalDAV integration goes to iCloud for every one of those requests. This
 * keeps each calendar's events for a rolling window (HA's own responses,
 * untouched, so recurring events and all-day dates come out exactly as HA
 * produces them) and answers requests inside the window from memory.
 *
 * Freshness:
 *  - every `pollMs`, `getChangeTags()` (iCloud getctag, one request for all
 *    calendars) says which calendars changed; only those are refetched.
 *  - calendars without a change tag (not iCloud, or no credentials) are
 *    refetched once they are `untaggedMaxAgeMs` old; every calendar is
 *    refetched at least every `maxAgeMs` as a safety net.
 *  - writes made through Beacon call `refresh(entityId)` straight away.
 * If a refetch fails the previous copy keeps being served.
 */
const fsp = require('fs/promises');
const { wallTimeToEpoch, zonedParts } = require('./icloud-caldav.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;

function createCalendarCache({
  fetchEvents,            // (entityId, startIso, endIso) => Promise<HA event list>
  getChangeTags = null,   // () => Promise<Map<entityId, tag|null>> | null
  getTimeZone = () => 'UTC',
  persistPath = null,
  now = () => Date.now(),
  pastDays = 62,
  futureDays = 190,
  pollMs = 2 * 60 * 1000,
  untaggedMaxAgeMs = 15 * 60 * 1000,
  maxAgeMs = 60 * 60 * 1000,
  maxConcurrentFetches = 2,
  log = console,
}) {
  /** entityId -> { start, end, events, fetchedAt, tag } */
  const entries = new Map();
  /** Calendars screens have asked for; only these are kept warm. */
  const wanted = new Set();
  const inFlight = new Map();
  // Background downloads share a small pool so they never burst iCloud.
  let active = 0;
  const waiting = [];
  async function withSlot(fn) {
    if (active >= maxConcurrentFetches) await new Promise((resolve) => waiting.push(resolve));
    active++;
    try { return await fn(); } finally {
      active--;
      waiting.shift()?.();
    }
  }
  let timer = null;
  let persistTimer = null;

  function dayStart(epochMs, tz) {
    const { year, month, day } = zonedParts(epochMs, tz);
    return wallTimeToEpoch({ year, month, day }, tz);
  }

  function windowNow() {
    const tz = getTimeZone();
    const today = dayStart(now(), tz);
    return { start: dayStart(today - pastDays * DAY_MS + DAY_MS / 2, tz), end: dayStart(today + futureDays * DAY_MS + DAY_MS / 2, tz) };
  }

  /** An HA event bound as epoch ms; an all-day "YYYY-MM-DD" is local midnight. */
  function boundMs(value, tz) {
    const v = typeof value === 'string' ? value : (value && (value.dateTime || value.date));
    if (!v) return NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [year, month, day] = v.split('-').map(Number);
      return wallTimeToEpoch({ year, month, day }, tz);
    }
    return Date.parse(v);
  }

  function overlapping(events, start, end) {
    const tz = getTimeZone();
    return events.filter((ev) => {
      const s = boundMs(ev.start, tz);
      const e = boundMs(ev.end, tz);
      if (Number.isNaN(s)) return true;
      if (Number.isNaN(e) || e <= s) return s >= start && s < end;
      return s < end && e > start;
    });
  }

  /**
   * Cached events for [start, end), or null when the range isn't covered yet
   * (the caller passes the request through; the calendar starts being cached).
   */
  function get(entityId, startStr, endStr) {
    const start = Date.parse(startStr);
    const end = Date.parse(endStr);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    wanted.add(entityId);
    const entry = entries.get(entityId);
    if (!entry || start < entry.start || end > entry.end) {
      refresh(entityId).catch(() => {});
      return null;
    }
    return { events: overlapping(entry.events, start, end), fetchedAt: entry.fetchedAt };
  }

  /**
   * Refetch one calendar's window from HA. A refresh already running is
   * reused, unless the caller needs data newer than when it started (a new
   * change tag, or `fresh` after a write): then one more runs after it.
   */
  function refresh(entityId, tag, { fresh = false } = {}) {
    if (inFlight.has(entityId)) {
      const running = inFlight.get(entityId);
      if (tag === undefined && !fresh) return running;
      return running.catch(() => {}).then(() => refresh(entityId, tag, { fresh }));
    }
    const job = (async () => {
      // Yield first: the finally below must run after inFlight.set, or a
      // synchronous failure would leave a dead job registered forever.
      await null;
      const t0 = now();
      try {
        const { start, end } = windowNow();
        if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`bad cache window for time zone ${getTimeZone()}`);
        const events = await withSlot(() => fetchEvents(entityId, new Date(start).toISOString(), new Date(end).toISOString()));
        const prev = entries.get(entityId);
        entries.set(entityId, { start, end, events, fetchedAt: now(), tag: tag !== undefined ? tag : prev?.tag ?? null });
        schedulePersist();
        log.info?.(`Calendar cache: ${entityId} refreshed (${events.length} events, ${now() - t0} ms)`);
      } catch (err) {
        log.warn?.(`Calendar cache: ${entityId} refresh failed, keeping the previous copy: ${err.message}`);
        throw err;
      } finally {
        inFlight.delete(entityId);
      }
    })();
    inFlight.set(entityId, job);
    return job;
  }

  /** One polling pass: refetch what changed or is too old, one calendar at a time. */
  async function poll() {
    if (!wanted.size) return;
    let tags = null;
    if (getChangeTags) {
      try { tags = await getChangeTags([...wanted]); } catch (err) {
        log.warn?.(`Calendar cache: change check failed: ${err.message}`);
      }
    }
    const { start: winStart } = windowNow();
    for (const entityId of wanted) {
      const entry = entries.get(entityId);
      const tag = tags?.get(entityId) ?? null;
      const age = entry ? now() - entry.fetchedAt : Infinity;
      const due = !entry
        || entry.start !== winStart                       // the window moved to a new day
        || age >= maxAgeMs
        || (tag ? tag !== entry.tag : age >= untaggedMaxAgeMs);
      if (due) await refresh(entityId, tag).catch(() => {});
    }
  }

  function schedulePersist() {
    if (!persistPath || persistTimer) return;
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        const data = { savedAt: now(), entries: Object.fromEntries(entries) };
        await fsp.writeFile(`${persistPath}.tmp`, JSON.stringify(data));
        await fsp.rename(`${persistPath}.tmp`, persistPath);
      } catch (err) {
        log.warn?.(`Calendar cache: could not save to disk: ${err.message}`);
      }
    }, 2000);
  }

  /** Reload the last saved copy so a restarted add-on answers straight away. */
  async function load() {
    if (!persistPath) return;
    try {
      const data = JSON.parse(await fsp.readFile(persistPath, 'utf8'));
      for (const [entityId, entry] of Object.entries(data.entries || {})) {
        if (entry && Array.isArray(entry.events)) {
          entries.set(entityId, entry);
          wanted.add(entityId);
        }
      }
      log.info?.(`Calendar cache: loaded ${entries.size} calendars from disk`);
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn?.(`Calendar cache: could not read saved copy: ${err.message}`);
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => { poll().catch(() => {}); }, pollMs);
    timer.unref?.();
    poll().catch(() => {});
  }

  /** Refetch every cached calendar now (one at a time). */
  async function refreshAll() {
    for (const entityId of wanted) await refresh(entityId).catch(() => {});
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  function status() {
    return [...wanted].map((entityId) => {
      const e = entries.get(entityId);
      return {
        entity_id: entityId,
        events: e ? e.events.length : 0,
        fetched_at: e ? new Date(e.fetchedAt).toISOString() : null,
        window: e ? [new Date(e.start).toISOString(), new Date(e.end).toISOString()] : null,
        tracked_by_change_tag: !!(e && e.tag),
      };
    });
  }

  return { get, refresh, refreshAll, poll, load, start, stop, status };
}

module.exports = { createCalendarCache };

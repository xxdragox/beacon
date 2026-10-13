import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { CalendarEvent, getFullColor, getPastelColor } from '../types';
import { useTranslation } from '../i18n';

interface MonthCalendarProps {
  events: CalendarEvent[];
  hiddenCalendars: Set<string>;
  onEventClick: (event: CalendarEvent) => void;
  /** A day was tapped: open its week in the week view. */
  onOpenWeek: (day: Date) => void;
  /** The grid's date range, so the parent can fetch events for it. */
  onVisibleRangeChange?: (start: Date, end: Date) => void;
  weekStartsOn: 0 | 1;
  timeFormat: '12h' | '24h';
  /** Extra controls on the toolbar's right side (view toggle, calendar filter). */
  toolbarExtra?: React.ReactNode;
}

/** Event chips shown per day before "+N more". */
const MAX_EVENTS = 4;

/** The local days an event covers (all-day end dates are exclusive). */
function eventDays(event: CalendarEvent): { first: Date; last: Date } {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const first = startOfDay(start);
  // Exclusive end: an event ending exactly at midnight doesn't touch that day.
  const lastMoment = end > start ? new Date(end.getTime() - 1) : start;
  return { first, last: startOfDay(lastMoment) };
}

/** A month grid of events; tapping a day opens its week. */
export function MonthCalendar({
  events, hiddenCalendars, onEventClick, onOpenWeek, onVisibleRangeChange, weekStartsOn, timeFormat, toolbarExtra,
}: MonthCalendarProps) {
  const { t, dateLocale } = useTranslation();
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => startOfMonth(today));

  const gridStart = startOfWeek(month, { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  useEffect(() => {
    onVisibleRangeChange?.(gridStart, addDays(gridEnd, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.toISOString()]);

  /** Visible events by local day key, all-day first, then by start time. */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (hiddenCalendars.has(event.calendarId)) continue;
      const { first, last } = eventDays(event);
      for (let d = first < gridStart ? gridStart : first; d <= last && d <= gridEnd; d = addDays(d, 1)) {
        const key = format(d, 'yyyy-MM-dd');
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, hiddenCalendars, gridStart.toISOString(), gridEnd.toISOString()]);

  const weekdayNames = days.slice(0, 7).map((d) => format(d, 'EEE', { locale: dateLocale }));
  const isCurrentMonth = isSameMonth(month, today);
  const timeLabel = (e: CalendarEvent) => format(parseISO(e.start), timeFormat === '24h' ? 'HH:mm' : 'h:mm', { locale: dateLocale });

  return (
    <div className="week-calendar month-calendar">
      <div className="week-nav">
        <div className="week-nav-controls">
          <button type="button" className="week-nav-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('monthCalendar.previousMonth')}>
            &lsaquo;
          </button>
          <button
            type="button"
            className={`week-nav-today ${isCurrentMonth ? 'week-nav-today--active' : ''}`}
            onClick={() => setMonth(startOfMonth(today))}
            disabled={isCurrentMonth}
          >
            {t('common.today')}
          </button>
          <button type="button" className="week-nav-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('monthCalendar.nextMonth')}>
            &rsaquo;
          </button>
        </div>
        <div className="week-nav-label">{format(month, 'MMMM yyyy', { locale: dateLocale })}</div>
        <div className="week-nav-jump">{toolbarExtra}</div>
      </div>

      <div className="month-grid" style={{ '--weeks': days.length / 7 } as React.CSSProperties}>
        {weekdayNames.map((name) => <div key={name} className="month-grid-head">{name}</div>)}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const list = byDay.get(key) ?? [];
          const shown = list.slice(0, MAX_EVENTS);
          const classes = [
            'month-grid-cell',
            isSameMonth(day, month) ? '' : 'month-grid-cell--outside',
            isSameDay(day, today) ? 'month-grid-cell--today' : '',
          ].join(' ');
          return (
            <div
              key={key}
              className={classes}
              role="button"
              tabIndex={0}
              onClick={() => onOpenWeek(day)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenWeek(day); }}
            >
              <span className="month-grid-num">{format(day, 'd')}</span>
              {shown.map((event) => (
                <button
                  key={`${event.id}-${event.start}`}
                  type="button"
                  className={`month-event ${event.allDay ? 'month-event--allday' : ''}`}
                  style={{
                    '--event-color': getFullColor(event.color),
                    '--event-pastel': getPastelColor(event.color),
                  } as React.CSSProperties}
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                  title={event.title}
                >
                  {!event.allDay && <span className="month-event-time">{timeLabel(event)}</span>}
                  <span className="month-event-title">{event.title}</span>
                </button>
              ))}
              {list.length > MAX_EVENTS && (
                <span className="month-grid-more">{t('monthCalendar.more', { count: list.length - MAX_EVENTS })}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

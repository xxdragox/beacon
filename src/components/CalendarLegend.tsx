import { CalendarInfo, getFullColor, getPastelColor } from '../types';
import { FamilyMember } from '../types/family';
import { useTranslation } from '../i18n';

interface CalendarLegendProps {
  calendars: CalendarInfo[];
  members: FamilyMember[];
  hiddenCalendars: Set<string>;
  /** Per-calendar color overrides from Settings (those aren't a member's color). */
  calendarColors?: Record<string, string>;
  onHide: () => void;
}

/**
 * Color key for the Calendar page: a tile per family member whose color is on
 * screen. A calendar takes the color of the first member it's linked to
 * (resolveCalendarColor), so a shared calendar like "Family" linked to Dad,
 * Mom and Brennon shows in Dad's color — the key lists exactly the members
 * that some visible calendar resolves to. Display only — choosing calendars
 * stays in the Calendars menu.
 */
export function CalendarLegend({ calendars, members, hiddenCalendars, calendarColors = {}, onHide }: CalendarLegendProps) {
  const { t } = useTranslation();
  const onScreen = new Set<string>();
  for (const cal of calendars) {
    if (hiddenCalendars.has(cal.id) || calendarColors[cal.id]) continue;
    const owner = members.find((m) => m.calendar_entity === cal.id || m.additional_calendar_entities?.includes(cal.id));
    if (owner) onScreen.add(owner.id);
  }
  const shown = members.filter((m) => onScreen.has(m.id));
  if (shown.length === 0) return null;

  return (
    <div className="calendar-legend" role="list" aria-label={t('calendarFilter.showKey')}>
      {shown.map((m) => (
        <div
          key={m.id}
          role="listitem"
          className="calendar-legend-tile"
          style={{
            '--legend-color': getFullColor(m.color),
            '--legend-pastel': getPastelColor(m.color),
          } as React.CSSProperties}
        >
          <span className="calendar-legend-initial" aria-hidden="true">
            {m.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="calendar-legend-name">{m.name}</span>
        </div>
      ))}
      <button type="button" className="calendar-legend-hide" onClick={onHide} aria-label={t('calendarLegend.hide')} title={t('calendarLegend.hide')}>
        ✕
      </button>
    </div>
  );
}

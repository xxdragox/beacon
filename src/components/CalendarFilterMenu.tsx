import { useEffect, useRef, useState } from 'react';
import { CalendarInfo } from '../types';
import { useTranslation } from '../i18n';

interface CalendarFilterMenuProps {
  calendars: CalendarInfo[];
  hiddenCalendars: Set<string>;
  onToggle: (calendarId: string) => void;
  /** Replace the whole hidden set (Show all / Hide all). */
  onSetHidden: (calendarIds: string[]) => void;
}

/**
 * "Calendars ▾" dropdown for the calendar toolbar: every calendar with its
 * color and a checkbox (hidden ones included, so they can be turned back on),
 * plus Show all / Hide all.
 */
export function CalendarFilterMenu({ calendars, hiddenCalendars, onToggle, onSetHidden }: CalendarFilterMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = calendars.filter((c) => !hiddenCalendars.has(c.id)).length;
  const sorted = [...calendars].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="cal-filter-menu" ref={ref}>
      <button
        type="button"
        className={`week-nav-jump-btn cal-filter-trigger ${open ? 'cal-filter-trigger--open' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t('calendarFilter.label')}
        <span className="cal-filter-count">{shown}/{calendars.length}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cal-filter-popover" role="menu">
          <ul className="cal-filter-list">
            {sorted.map((cal) => {
              const visible = !hiddenCalendars.has(cal.id);
              return (
                <li key={cal.id}>
                  <label className="cal-filter-item" role="menuitemcheckbox" aria-checked={visible}>
                    <input type="checkbox" checked={visible} onChange={() => onToggle(cal.id)} />
                    <span className="cal-filter-dot" style={{ backgroundColor: cal.color }} />
                    <span className="cal-filter-name">{cal.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="cal-filter-actions">
            <button type="button" className="cal-filter-action" onClick={() => onSetHidden([])}>
              {t('calendarFilter.showAll')}
            </button>
            <button type="button" className="cal-filter-action" onClick={() => onSetHidden(calendars.map((c) => c.id))}>
              {t('calendarFilter.hideAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

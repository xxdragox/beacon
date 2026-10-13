import { useMemo, useState } from 'react';
import { Chore, ChoreCompletion, FamilyMember } from '../../types/family';
import { ChoreOccurrence, addDays, addMonths, choreGroup, occurrencesForDay, occurrencesInRange, weekdayOf } from '../../api/chore-schedule';
import { occurrenceIsFor } from '../../hooks/useChoreDay';
import { weekStartFor } from './WeekChoresView';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Chore lines shown in a day cell before "+N more". */
const MAX_LINES = 3;

interface MonthChoresViewProps {
  chores: Chore[];
  completions: ChoreCompletion[];
  members: FamilyMember[];
  today: string;
  weekStartsOn: 0 | 1;
  memberFilter: string | null;
  /** Open a day in the Day view. */
  onOpenDay: (date: string) => void;
}

/** One chore on one day, with the state of each person's (or the shared) occurrence. */
interface Line {
  chore: Chore;
  occurrences: ChoreOccurrence[];
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Dot color/style for one occurrence: person color, filled when done, red when late, hollow when upcoming. */
function Dot({ o, members }: { o: ChoreOccurrence; members: FamilyMember[] }) {
  const who = o.completion?.member_id ?? o.memberId;
  const color = members.find((m) => m.id === who)?.color ?? 'var(--text-secondary)';
  return <span className={`month-dot month-dot--${o.state}`} style={{ '--dot-color': color } as React.CSSProperties} />;
}

/** A month of chores on a calendar grid; daily chores are hidden unless asked for. */
export function MonthChoresView({ chores, completions, members, today, weekStartsOn, memberFilter, onOpenDay }: MonthChoresViewProps) {
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [showDaily, setShowDaily] = useState(false);

  const gridStart = weekStartFor(month, weekStartsOn);
  const nextMonth = addMonths(month, 1);
  // 5 or 6 weeks, whatever the month needs.
  const weeks = Math.ceil((Math.round((Date.parse(nextMonth) - Date.parse(gridStart)) / 86400000)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const gridEnd = days[days.length - 1];

  const linesByDay = useMemo(() => {
    const byDay = new Map<string, Line[]>();
    const add = (date: string, chore: Chore, o: ChoreOccurrence) => {
      const lines = byDay.get(date) ?? [];
      let line = lines.find((l) => l.chore.id === chore.id);
      if (!line) { line = { chore, occurrences: [] }; lines.push(line); }
      line.occurrences.push(o);
      byDay.set(date, lines);
    };
    const visible = (o: ChoreOccurrence) => !memberFilter || occurrenceIsFor(o, memberFilter);
    for (const chore of chores) {
      if (!showDaily && choreGroup(chore) === 'daily') continue;
      for (const o of occurrencesInRange(chore, completions, gridStart, gridEnd, today)) {
        if (visible(o)) add(o.dueDate, chore, o);
      }
      // Chores overdue from before the grid collect under today, like the Week view.
      if (today >= gridStart && today <= gridEnd) {
        for (const o of occurrencesForDay(chore, completions, today, today)) {
          if (o.state === 'overdue' && o.dueDate < gridStart && visible(o)) add(today, chore, o);
        }
      }
    }
    for (const lines of byDay.values()) lines.sort((a, b) => a.chore.name.localeCompare(b.chore.name));
    return byDay;
  }, [chores, completions, gridStart, gridEnd, today, memberFilter, showDaily]);

  const [y, m] = month.split('-').map(Number);
  const headerDays = Array.from({ length: 7 }, (_, i) => DAY_SHORT[(weekStartsOn + i) % 7]);
  const thisMonth = firstOfMonth(today);

  return (
    <div className="chores-month">
      <div className="chores-day-nav">
        <button type="button" className="dash-day-nav-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
        <span className="chores-day-title">{MONTH_NAMES[m - 1]} {y}</span>
        <button type="button" className="dash-day-nav-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
        {month !== thisMonth && (
          <button type="button" className="dash-day-nav-today" onClick={() => setMonth(thisMonth)}>This month</button>
        )}
        <label className="chores-month-toggle">
          <input type="checkbox" checked={showDaily} onChange={(e) => setShowDaily(e.target.checked)} />
          Show daily chores
        </label>
      </div>

      <div className="chores-month-grid" style={{ '--weeks': weeks } as React.CSSProperties}>
        {headerDays.map((d) => <div key={d} className="chores-month-head">{d}</div>)}
        {days.map((date) => {
          const lines = linesByDay.get(date) ?? [];
          const shown = lines.slice(0, MAX_LINES);
          const inMonth = date.slice(0, 7) === month.slice(0, 7);
          const classes = [
            'chores-month-cell',
            inMonth ? '' : 'chores-month-cell--outside',
            date === today ? 'chores-month-cell--today' : '',
            weekdayOf(date) === 0 || weekdayOf(date) === 6 ? 'chores-month-cell--weekend' : '',
          ].join(' ');
          return (
            <button key={date} type="button" className={classes} onClick={() => onOpenDay(date)} title="Open in Day view">
              <span className="chores-month-num">{Number(date.slice(8, 10))}</span>
              {shown.map((line) => (
                <span key={line.chore.id} className="chores-month-line">
                  <span className="chores-month-name">
                    {line.chore.icon && <span className="chores-month-icon">{line.chore.icon}</span>}
                    {line.chore.name}
                  </span>
                  <span className="chores-month-dots">
                    {line.occurrences.map((o) => <Dot key={`${o.memberId ?? '*'}-${o.dueDate}`} o={o} members={members} />)}
                  </span>
                </span>
              ))}
              {lines.length > MAX_LINES && <span className="chores-month-more">+{lines.length - MAX_LINES} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

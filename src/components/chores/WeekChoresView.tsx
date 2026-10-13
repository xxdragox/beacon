import { useState } from 'react';
import { Chore, ChoreCompletion, FamilyMember } from '../../types/family';
import {
  ChoreOccurrence,
  addDays,
  canToggle,
  formatShortDate,
  occurrencesForDay,
  occurrencesInRange,
  weekdayOf,
} from '../../api/chore-schedule';
import { occurrenceIsFor } from '../../hooks/useChoreDay';
import { ChoreIcon } from './choreIcons';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WeekChoresViewProps {
  chores: Chore[];
  completions: ChoreCompletion[];
  members: FamilyMember[];
  today: string;
  /** 0 = weeks start Sunday, 1 = Monday (Settings). */
  weekStartsOn: 0 | 1;
  /** Only this person's chores, when set. */
  memberFilter: string | null;
  onToggle: (item: ChoreOccurrence, creditMemberId?: string) => void;
  /** Open a day in the Day view. */
  onOpenDay: (date: string) => void;
}

export function weekStartFor(date: string, weekStartsOn: 0 | 1): string {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

/** One chore on one day: its occurrences (one per person, or a single shared one). */
interface DayRow {
  chore: Chore;
  occurrences: ChoreOccurrence[];
}

function rowsForDay(
  chores: Chore[], completions: ChoreCompletion[], date: string, today: string, weekStart: string, memberFilter: string | null,
): DayRow[] {
  const rows: DayRow[] = [];
  for (const chore of chores) {
    // Today also carries chores overdue from before this week (ones from
    // earlier this week stay, in red, on their own day instead of repeating).
    let occurrences = date === today
      ? occurrencesForDay(chore, completions, date, today).filter((o) => o.dueDate === today || o.dueDate < weekStart)
      : occurrencesInRange(chore, completions, date, date, today);
    if (memberFilter) occurrences = occurrences.filter((o) => occurrenceIsFor(o, memberFilter));
    if (occurrences.length > 0) rows.push({ chore, occurrences });
  }
  return rows.sort((a, b) => a.chore.name.localeCompare(b.chore.name));
}

const STATE_LABEL: Record<ChoreOccurrence['state'], string> = {
  done: 'done',
  due: 'due',
  overdue: 'overdue',
  missed: 'missed',
  upcoming: 'upcoming',
};

interface PillProps {
  member: FamilyMember | undefined;
  label: string;
  state: ChoreOccurrence['state'] | 'other-did-it';
  enabled: boolean;
  onClick?: () => void;
}

function PersonPill({ member, label, state, enabled, onClick }: PillProps) {
  const color = member?.color ?? 'var(--text-secondary)';
  return (
    <button
      type="button"
      className={`week-pill week-pill--${state}`}
      style={{ '--pill-color': color } as React.CSSProperties}
      disabled={!enabled}
      onClick={onClick}
      title={`${label}: ${state === 'other-did-it' ? 'done by someone else' : STATE_LABEL[state]}`}
    >
      {state === 'done' && <span aria-hidden="true">✓ </span>}
      {label}
    </button>
  );
}

/**
 * Pills for one chore on one day. Individual chores get a pill per person;
 * shared chores get a pill per assignee (tapping one credits that person);
 * open chores get an "Anyone" pill that expands into everyone's names.
 */
function RowPills({ row, members, today, memberFilter, onToggle }: {
  row: DayRow;
  members: FamilyMember[];
  today: string;
  memberFilter: string | null;
  onToggle: (item: ChoreOccurrence, creditMemberId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const byId = (id: string) => members.find((m) => m.id === id);

  return (
    <div className="week-pills">
      {row.occurrences.map((o) => {
        const enabled = canToggle(o, today);
        if (o.memberId !== null) {
          const m = byId(o.memberId);
          return (
            <PersonPill key={o.memberId} member={m} label={m?.name ?? '?'} state={o.state} enabled={enabled} onClick={() => onToggle(o)} />
          );
        }
        // Shared or open: one occurrence, credited to whoever's pill is tapped.
        const doer = o.completion?.member_id;
        const candidates = o.chore.assigned_to.length > 0
          ? o.chore.assigned_to
          : memberFilter ? [memberFilter] : members.map((m) => m.id);
        const visible = memberFilter ? candidates.filter((id) => id === memberFilter || id === doer) : candidates;
        if (o.chore.assigned_to.length === 0 && !doer && !expanded && !memberFilter) {
          return (
            <PersonPill
              key="anyone"
              member={undefined}
              label="Anyone"
              state={o.state}
              enabled={enabled}
              onClick={() => setExpanded(true)}
            />
          );
        }
        return visible.map((id) => {
          const m = byId(id);
          const state = o.state === 'done' ? (id === doer ? 'done' : 'other-did-it') : o.state;
          const pillEnabled = enabled && (o.state !== 'done' || id === doer);
          return (
            <PersonPill
              key={`${o.dueDate}-${id}`}
              member={m}
              label={m?.name ?? '?'}
              state={state}
              enabled={pillEnabled}
              onClick={() => { setExpanded(false); onToggle(o, id); }}
            />
          );
        });
      })}
    </div>
  );
}

/** A week of chores: a column per day, a row per chore, a pill per person. */
export function WeekChoresView({ chores, completions, members, today, weekStartsOn, memberFilter, onToggle, onOpenDay }: WeekChoresViewProps) {
  const [weekStart, setWeekStart] = useState(() => weekStartFor(today, weekStartsOn));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const thisWeek = weekStartFor(today, weekStartsOn);
  const label = `${formatShortDate(days[0]).replace(/, \d{4}$/, '')} – ${formatShortDate(days[6])}`;

  return (
    <div className="chores-week">
      <div className="chores-day-nav">
        <button type="button" className="dash-day-nav-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
        <span className="chores-day-title">
          {weekStart === thisWeek ? 'This week' : weekStart === addDays(thisWeek, 7) ? 'Next week' : weekStart === addDays(thisWeek, -7) ? 'Last week' : 'Week'}
          <span className="chores-day-date">{label}</span>
        </span>
        <button type="button" className="dash-day-nav-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
        {weekStart !== thisWeek && (
          <button type="button" className="dash-day-nav-today" onClick={() => setWeekStart(thisWeek)}>This week</button>
        )}
      </div>

      <div className="chores-week-grid">
        {days.map((date) => {
          const rows = rowsForDay(chores, completions, date, today, weekStart, memberFilter);
          const isToday = date === today;
          return (
            <section key={date} className={`chores-week-day ${isToday ? 'chores-week-day--today' : ''} ${date < today ? 'chores-week-day--past' : ''}`}>
              <button type="button" className="chores-week-day-head" onClick={() => onOpenDay(date)} title="Open in Day view">
                <span className="chores-week-day-name">{isToday ? 'Today' : DAY_SHORT[weekdayOf(date)]}</span>
                <span className="chores-week-day-num">{Number(date.slice(8, 10))}</span>
              </button>
              <div className="chores-week-rows">
                {rows.length === 0 ? (
                  <span className="chores-week-empty">—</span>
                ) : (
                  rows.map((row) => (
                    <div key={row.chore.id} className="chores-week-row">
                      <span className="chores-week-name">
                        <ChoreIcon icon={row.chore.icon} className="chores-week-icon" />
                        {row.chore.name}
                      </span>
                      <RowPills row={row} members={members} today={today} memberFilter={memberFilter} onToggle={onToggle} />
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

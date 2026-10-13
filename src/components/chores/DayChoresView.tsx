import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Chore, ChoreCompletion, FamilyMember, Streak } from '../../types/family';
import { ChoreOccurrence, addDays, canToggle, formatShortDate, weekdayOf } from '../../api/chore-schedule';
import { choreItemsForDay, occurrenceKey } from '../../hooks/useChoreDay';
import { ChoreCard } from '../ChoreCard';
import { StreakBadge } from '../StreakBadge';
import { TaskChecklist } from '../TaskChecklist';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DayChoresViewProps {
  chores: Chore[];
  completions: ChoreCompletion[];
  members: FamilyMember[];
  today: string;
  /** Day to show; defaults to today. */
  date?: string;
  onDateChange?: (date: string) => void;
  currencySymbol: string;
  getStreakForMember: (memberId: string) => Streak;
  onToggle: (item: ChoreOccurrence, creditMemberId?: string) => void;
  onAdd: (memberId?: string) => void;
}

/** "Overdue · Sat, Oct 10", "Shared", "Shared · done by Keegan" … */
function noteFor(item: ChoreOccurrence, member: FamilyMember, members: FamilyMember[]): { note?: string; tone?: 'overdue' | 'muted' } {
  if (item.state === 'overdue') {
    const day = DAY_SHORT[weekdayOf(item.dueDate)];
    return { note: `Overdue · ${day}, ${formatShortDate(item.dueDate).replace(/, \d{4}$/, '')}`, tone: 'overdue' };
  }
  if (item.memberId === null) {
    const doneBy = item.completion && item.completion.member_id !== member.id
      ? members.find((m) => m.id === item.completion!.member_id)?.name
      : undefined;
    return { note: doneBy ? `Shared · done by ${doneBy}` : 'Shared', tone: 'muted' };
  }
  return {};
}

/** Chores due on one day (today also shows overdue ones), a column per person. */
export function DayChoresView({
  chores, completions, members, today, date: controlledDate, onDateChange, currencySymbol,
  getStreakForMember, onToggle, onAdd,
}: DayChoresViewProps) {
  const [ownDate, setOwnDate] = useState(today);
  const date = controlledDate ?? ownDate;
  const setDate = (d: string) => (onDateChange ? onDateChange(d) : setOwnDate(d));

  const items = choreItemsForDay(chores, completions, date, today);
  const openItems = items.filter((o) => o.memberId === null && o.chore.assigned_to.length === 0);
  const itemsFor = (memberId: string) =>
    items.filter((o) => o.memberId === memberId || (o.memberId === null && o.chore.assigned_to.includes(memberId)));

  const isToday = date === today;
  const heading = isToday ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : DAY_NAMES[weekdayOf(date)];

  return (
    <div className="chores-day">
      <div className="chores-day-nav">
        <button type="button" className="dash-day-nav-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <span className="chores-day-title">
          {heading}
          <span className="chores-day-date">{formatShortDate(date)}</span>
        </span>
        <button type="button" className="dash-day-nav-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        {!isToday && (
          <button type="button" className="dash-day-nav-today" onClick={() => setDate(today)}>Today</button>
        )}
        {!isToday && <span className="chores-day-hint">Only today's and overdue chores can be checked off.</span>}
      </div>

      {openItems.length > 0 && (
        <section className="chores-unassigned-section">
          <h2 className="chores-section-title">Anyone</h2>
          <TaskChecklist items={openItems} today={today} onToggle={onToggle} members={members} />
        </section>
      )}

      <div className="chores-family-grid" style={{ '--member-count': members.length } as React.CSSProperties}>
        {members.map((member) => {
          const memberItems = itemsFor(member.id);
          const done = memberItems.filter((o) => o.state === 'done').length;
          return (
            <section key={member.id} className="chores-member-col">
              <div className="dash-member-header">
                <span className="dash-member-name" style={{ color: member.color }}>{member.name}</span>
                <StreakBadge streak={getStreakForMember(member.id)} size="sm" />
              </div>

              {memberItems.length > 0 && (
                <div className="chores-progress">
                  <div className="chores-progress-bar">
                    <div
                      className="chores-progress-fill"
                      style={{ width: `${(done / memberItems.length) * 100}%`, backgroundColor: member.color }}
                    />
                  </div>
                  <span className="chores-progress-text">{done}/{memberItems.length}</span>
                </div>
              )}

              <div className="chores-member-col-list">
                {memberItems.length === 0 ? (
                  <div className="chores-member-empty">{isToday ? 'Nothing due today' : 'Nothing due'}</div>
                ) : (
                  <div className="chores-list">
                    {memberItems.map((item) => {
                      const { note, tone } = noteFor(item, member, members);
                      return (
                        <ChoreCard
                          key={occurrenceKey(item)}
                          chore={item.chore}
                          member={member}
                          isCompleted={item.state === 'done'}
                          disabled={!canToggle(item, today)}
                          note={note}
                          noteTone={tone}
                          onComplete={() => onToggle(item, member.id)}
                          onUncomplete={() => onToggle(item, member.id)}
                          currencySymbol={currencySymbol}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              <button type="button" className="chores-member-add-btn" onClick={() => onAdd(member.id)}>
                <Plus size={14} strokeWidth={2} />
                Add chore for {member.name}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { FamilyMember } from '../types/family';
import { ChoreOccurrence, canToggle } from '../api/chore-schedule';
import { occurrenceKey } from '../hooks/useChoreDay';
import { hapticMedium, hapticSuccess } from '../hooks/useHaptics';
import { useTranslation } from '../i18n';

interface TaskChecklistProps {
  /** Chore occurrences to show (today's plus overdue). */
  items: ChoreOccurrence[];
  today: string;
  /** Check off / undo; `creditMemberId` says who did a shared or open chore. */
  onToggle: (item: ChoreOccurrence, creditMemberId?: string) => void;
  members?: FamilyMember[];
  /** Who gets credit for shared/open chores without asking (e.g. a member filter or Focus view). */
  creditMemberId?: string | null;
}

/** People who can do an occurrence: its own person, or a shared/open chore's assignees (anyone if unassigned). */
function eligibleMembers(item: ChoreOccurrence, members: FamilyMember[]): FamilyMember[] {
  if (item.memberId !== null) return members.filter((m) => m.id === item.memberId);
  if (item.chore.assigned_to.length === 0) return members;
  return members.filter((m) => item.chore.assigned_to.includes(m.id));
}

function AssigneeBadges({ item, members }: { item: ChoreOccurrence; members: FamilyMember[] }) {
  // A done shared chore shows who did it; otherwise who it's for.
  const ids = item.state === 'done' && item.completion ? [item.completion.member_id]
    : item.memberId !== null ? [item.memberId] : item.chore.assigned_to;
  const people = ids.map((id) => members.find((m) => m.id === id)).filter((m): m is FamilyMember => Boolean(m));
  if (people.length === 0) return null;
  return (
    <span className="task-checklist-assignees">
      {people.map((m) => (
        <span
          key={m.id}
          className="task-checklist-assignee"
          style={{ backgroundColor: m.color + '22', borderColor: m.color }}
        >
          <span className="task-checklist-assignee-name" style={{ color: m.color }}>
            {m.name}
          </span>
        </span>
      ))}
    </span>
  );
}

export function TaskChecklist({ items, today, onToggle, members = [], creditMemberId }: TaskChecklistProps) {
  const { t } = useTranslation();
  const [animatingKey, setAnimatingKey] = useState<string | null>(null);
  const [pickingKey, setPickingKey] = useState<string | null>(null);

  const incomplete = items.filter((i) => i.state !== 'done');
  const completed = items.filter((i) => i.state === 'done');

  const finish = (item: ChoreOccurrence, credit?: string) => {
    const key = occurrenceKey(item);
    if (item.state !== 'done') {
      setAnimatingKey(key);
      setTimeout(() => setAnimatingKey(null), 400);
      hapticMedium();
      if (incomplete.length === 1) hapticSuccess();
    }
    setPickingKey(null);
    onToggle(item, credit);
  };

  const handleToggle = (item: ChoreOccurrence) => {
    if (!canToggle(item, today)) return;
    if (item.state === 'done' || item.memberId !== null) return finish(item);
    // Shared or open chore: credit the known person, the only eligible one, or ask.
    const eligible = eligibleMembers(item, members);
    const known = creditMemberId && eligible.some((m) => m.id === creditMemberId) ? creditMemberId : null;
    if (known) return finish(item, known);
    if (eligible.length === 1) return finish(item, eligible[0].id);
    setPickingKey((k) => (k === occurrenceKey(item) ? null : occurrenceKey(item)));
  };

  if (items.length === 0) {
    return <div className="task-checklist-empty">{t('taskChecklist.empty')}</div>;
  }

  if (incomplete.length === 0) {
    return <div className="task-checklist-done">{t('taskChecklist.allDone')}</div>;
  }

  const row = (item: ChoreOccurrence) => {
    const key = occurrenceKey(item);
    const done = item.state === 'done';
    const name = item.chore.name;
    return (
      <li key={key} className={`task-checklist-item ${done ? 'task-checklist-item--done' : ''}`}>
        <button
          type="button"
          className={`task-checkbox ${done ? 'task-checkbox--checked' : ''} ${animatingKey === key ? 'task-checkbox--completing' : ''}`}
          onClick={() => handleToggle(item)}
          disabled={!canToggle(item, today)}
          aria-label={done ? t('taskChecklist.undo', { name }) : t('taskChecklist.complete', { name })}
        >
          <span className="task-checkbox-box">
            {done && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        </button>
        <span className={`task-checklist-label ${done ? 'task-checklist-label--done' : ''}`}>
          {item.chore.icon && <span className="task-checklist-icon">{item.chore.icon}</span>}
          <span className="task-checklist-name" title={name}>{name}</span>
          {item.state === 'overdue' && <span className="task-checklist-overdue">{t('taskChecklist.overdue')}</span>}
        </span>
        <AssigneeBadges item={item} members={members} />
        {pickingKey === key && (
          <div className="task-checklist-picker" role="group" aria-label={t('taskChecklist.whoDidIt')}>
            <span className="task-checklist-picker-label">{t('taskChecklist.whoDidIt')}</span>
            {eligibleMembers(item, members).map((m) => (
              <button
                key={m.id}
                type="button"
                className="task-checklist-picker-btn"
                style={{ borderColor: m.color, color: m.color }}
                onClick={() => finish(item, m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </li>
    );
  };

  return <ul className="task-checklist">{incomplete.map(row)}{completed.map(row)}</ul>;
}

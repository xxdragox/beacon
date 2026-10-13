import { useState } from 'react';
import { formatChoreValue } from '../../types/family';
import { ChoreOccurrence, canToggle } from '../../api/chore-schedule';
import { occurrenceKey } from '../../hooks/useChoreDay';
import { hapticMedium, hapticSuccess } from '../../hooks/useHaptics';
import { ChoreIcon } from '../chores/choreIcons';

interface FocusChoresProps {
  /** This person's chore occurrences due today, plus overdue. */
  items: ChoreOccurrence[];
  today: string;
  currencySymbol: string;
  onToggle: (item: ChoreOccurrence) => void;
}

export function FocusChores({ items, today, currencySymbol, onToggle }: FocusChoresProps) {
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  const remaining = items.filter((o) => o.state !== 'done').length;

  const handleToggle = (item: ChoreOccurrence) => {
    if (!canToggle(item, today)) return;
    if (item.state !== 'done') {
      setAnimatingId(occurrenceKey(item));
      setTimeout(() => setAnimatingId(null), 400);
      hapticMedium();
      if (remaining === 1) hapticSuccess();
    }
    onToggle(item);
  };

  return (
    <section className="focus-card">
      <header className="focus-card-header">
        <h2 className="focus-card-title">Chores</h2>
        <span className="focus-card-count">
          {remaining === 0 ? 'Done!' : `${items.length - remaining}/${items.length}`}
        </span>
      </header>
      <ul className="focus-checklist">
        {items.map((item) => {
          const { chore } = item;
          const done = item.state === 'done';
          const key = occurrenceKey(item);
          return (
            <li key={key}>
              <button
                type="button"
                className={`focus-check-row ${done ? 'focus-check-row--done' : ''} ${animatingId === key ? 'focus-check-row--completing' : ''}`}
                onClick={() => handleToggle(item)}
                disabled={!canToggle(item, today)}
                aria-label={done ? `Undo ${chore.name}` : `Complete ${chore.name}`}
              >
                <span className="focus-check-box">
                  {done && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="focus-check-label">
                  <ChoreIcon icon={chore.icon} className="focus-check-icon" />
                  {chore.name}
                  {item.state === 'overdue' && <span className="task-checklist-overdue">Overdue</span>}
                </span>
                {chore.value_cents > 0 && (
                  <span className="focus-check-value">
                    {formatChoreValue(chore.value_cents, currencySymbol)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useState, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Chore, FamilyMember, formatChoreValue } from '../types/family';
import { ChoreIcon } from './chores/choreIcons';

interface ChoreCardProps {
  chore: Chore;
  member: FamilyMember;
  isCompleted: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  currencySymbol?: string;
  /** Small line under the name, e.g. "Overdue · was due Sat, Oct 10" or "Shared". */
  note?: string;
  noteTone?: 'overdue' | 'muted';
  /** Checkbox can't be toggled (past or future days). */
  disabled?: boolean;
}

function formatCents(cents: number, currencySymbol: string): string {
  return formatChoreValue(cents, currencySymbol);
}

export function ChoreCard({
  chore,
  member,
  isCompleted,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
  currencySymbol = '$',
  note,
  noteTone = 'muted',
  disabled = false,
}: ChoreCardProps) {
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [swiped, setSwiped] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleToggle = () => {
    if (disabled) return;
    if (isCompleted) {
      onUncomplete();
      return;
    }
    setAnimating(true);
    onComplete();
    setTimeout(() => setAnimating(false), 600);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwiped(false);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    // Swipe left to "skip" — just visual feedback
    if (diff < -80) {
      setSwiped(true);
      setTimeout(() => setSwiped(false), 2000);
    }
    touchStartX.current = null;
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete?.();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const value = formatCents(chore.value_cents, currencySymbol);

  return (
    <div
      className={`chore-card ${isCompleted ? 'chore-card--done' : ''} ${swiped ? 'chore-card--swiped' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="chore-card-left">
        <span
          className="chore-card-dot"
          style={{ backgroundColor: member.color }}
          title={member.name}
        />
      </div>

      <div className="chore-card-body">
        <span className={`chore-card-name ${isCompleted ? 'chore-card-name--done' : ''}`}>
          <ChoreIcon icon={chore.icon} className="chore-card-icon" />
          {chore.name}
        </span>
        {note && <span className={`chore-card-note chore-card-note--${noteTone}`}>{note}</span>}
        {value && <span className="chore-card-value">{value}</span>}
      </div>

      {(onEdit || onDelete) && (
        <div className="chore-card-actions">
          {onEdit && (
            <button
              type="button"
              className="chore-card-action-btn"
              onClick={onEdit}
              aria-label={`Edit ${chore.name}`}
            >
              <Pencil size={15} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="chore-card-action-btn chore-card-action-btn--danger"
              onClick={handleDeleteClick}
              aria-label={`Delete ${chore.name}`}
            >
              {confirmDelete ? (
                <span className="chore-card-action-confirm">Sure?</span>
              ) : (
                <Trash2 size={15} />
              )}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className={`chore-checkbox ${isCompleted ? 'chore-checkbox--checked' : ''} ${animating ? 'chore-checkbox--bounce' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-label={isCompleted ? `Undo ${chore.name}` : `Complete ${chore.name}`}
      >
        {isCompleted && (
          <svg className="chore-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="4 12 10 18 20 6" />
          </svg>
        )}
      </button>

      {swiped && <div className="chore-card-skip">Skipped</div>}
    </div>
  );
}

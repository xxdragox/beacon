import { useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Chore, FamilyMember, formatChoreValue } from '../../types/family';
import { CHORE_GROUP_ORDER, ChoreGroup, choreGroup, describeSchedule, isSharedChore, scheduleOf } from '../../api/chore-schedule';

const GROUP_TITLES: Record<ChoreGroup, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  'few-weeks': 'Every few weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  once: 'One time',
};

interface ManageChoresViewProps {
  chores: Chore[];
  members: FamilyMember[];
  currencySymbol: string;
  onAdd: () => void;
  onEdit: (chore: Chore) => void;
  onDelete: (choreId: string) => void;
}

function DeleteButton({ chore, onDelete }: { chore: Chore; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      type="button"
      className="chore-card-action-btn chore-card-action-btn--danger"
      aria-label={`Delete ${chore.name}`}
      onClick={() => {
        if (confirm) {
          onDelete();
          setConfirm(false);
        } else {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
        }
      }}
    >
      {confirm ? <span className="chore-card-action-confirm">Sure?</span> : <Trash2 size={15} />}
    </button>
  );
}

/** Every chore, grouped by how often it comes around, for setting chores up. */
export function ManageChoresView({ chores, members, currencySymbol, onAdd, onEdit, onDelete }: ManageChoresViewProps) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const groups = CHORE_GROUP_ORDER
    .map((group) => ({ group, chores: chores.filter((c) => choreGroup(c) === group).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.chores.length > 0);

  if (chores.length === 0) {
    return (
      <div className="chores-empty">
        <p>No chores yet.</p>
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <Plus size={16} strokeWidth={2} />
          Add your first chore
        </button>
      </div>
    );
  }

  return (
    <div className="chores-manage">
      {groups.map(({ group, chores: groupChores }) => (
        <section key={group} className="settings-group chores-manage-group">
          <h2 className="settings-group-title">{GROUP_TITLES[group]}</h2>
          <ul className="chores-manage-list">
            {groupChores.map((chore) => {
              const value = formatChoreValue(chore.value_cents, currencySymbol);
              const assignees = chore.assigned_to.map((id) => memberById.get(id)).filter(Boolean) as FamilyMember[];
              return (
                <li key={chore.id} className="chores-manage-row">
                  <span className="chores-manage-icon" aria-hidden="true">{chore.icon || '🧹'}</span>
                  <div className="chores-manage-info">
                    <span className="chores-manage-name">{chore.name}</span>
                    <span className="chores-manage-schedule">{describeSchedule(scheduleOf(chore))}</span>
                  </div>
                  <div className="chores-manage-people">
                    {assignees.length === 0 ? (
                      <span className="chores-manage-open">Anyone</span>
                    ) : (
                      assignees.map((m) => (
                        <span key={m.id} className="chores-manage-person" style={{ color: m.color, borderColor: m.color }}>
                          {m.name}
                        </span>
                      ))
                    )}
                    {isSharedChore(chore) && assignees.length > 1 && (
                      <span className="chores-manage-shared" title="Done once by whoever gets to it">
                        <Users size={12} /> Shared
                      </span>
                    )}
                  </div>
                  {value && <span className="chore-card-value">{value}</span>}
                  <div className="chores-manage-actions">
                    <button type="button" className="chore-card-action-btn" onClick={() => onEdit(chore)} aria-label={`Edit ${chore.name}`}>
                      <Pencil size={15} />
                    </button>
                    <DeleteButton chore={chore} onDelete={() => onDelete(chore.id)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

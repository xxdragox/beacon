import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Chore, ChoreSchedule, FamilyMember, STAR_CURRENCY } from '../types/family';
import { ChoreOccurrence, scheduleOf } from '../api/chore-schedule';
import { toggleOccurrence, useTodayKey } from '../hooks/useChoreDay';
import { DayChoresView } from './chores/DayChoresView';
import { ScheduleEditor, defaultSchedule } from './chores/ScheduleEditor';
import { ManageChoresView } from './chores/ManageChoresView';
import { useChores } from '../hooks/useChores';
import { useFamily } from '../hooks/useFamily';
import { useSettings } from '../hooks/useSettings';

const CHORE_ICONS = ['🧹', '🍽️', '🐕', '🛏️', '📚', '🗑️', '👕', '🧺', '🪥', '🚿', '🧼', '💪'];

const emptyChoreForm = () => ({
  name: '',
  value_cents: 100,
  schedule: defaultSchedule() as ChoreSchedule,
  shared: false,
  assigned_to: [] as string[],
  icon: '🧹',
});

type ChoresTab = 'day' | 'manage';

export function ChoresView() {
  const { members } = useFamily();
  const { settings } = useSettings();
  const {
    chores,
    completions,
    addChore,
    updateChore,
    removeChore,
    completeChore,
    uncompleteChore,
    getStreakForMember,
  } = useChores();
  const today = useTodayKey();

  const [tab, setTab] = useState<ChoresTab>('day');
  const [showForm, setShowForm] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [newChore, setNewChore] = useState(emptyChoreForm);

  const isEditing = editingChoreId !== null;

  const openAddForm = (presetMemberId?: string) => {
    setNewChore({
      ...emptyChoreForm(),
      assigned_to: presetMemberId ? [presetMemberId] : [],
    });
    setEditingChoreId(null);
    setShowForm(true);
  };

  const handleStartEdit = (chore: Chore) => {
    setNewChore({
      name: chore.name,
      value_cents: chore.value_cents,
      schedule: scheduleOf(chore),
      shared: !!chore.shared,
      assigned_to: [...chore.assigned_to],
      icon: chore.icon || '🧹',
    });
    setEditingChoreId(chore.id);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingChoreId(null);
    setNewChore(emptyChoreForm());
  };

  const handleSaveChore = () => {
    if (!newChore.name.trim()) return;
    if (newChore.schedule.type === 'weekly' && newChore.schedule.days.length === 0) return;

    const data = {
      name: newChore.name.trim(),
      value_cents: newChore.value_cents,
      schedule: newChore.schedule,
      // "Shared" only means something with two or more people assigned.
      shared: newChore.assigned_to.length > 1 && newChore.shared,
      assigned_to: newChore.assigned_to,
      icon: newChore.icon,
    };
    if (isEditing) {
      updateChore(editingChoreId, data);
    } else {
      addChore(data);
    }

    handleCloseForm();
  };

  const handleDeleteChore = (id: string) => {
    removeChore(id);
    if (editingChoreId === id) {
      handleCloseForm();
    }
  };

  const toggleAssigned = (memberId: string) => {
    setNewChore((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(memberId)
        ? prev.assigned_to.filter((id) => id !== memberId)
        : [...prev.assigned_to, memberId],
    }));
  };

  const handleToggle = (item: ChoreOccurrence, creditMemberId?: string) =>
    toggleOccurrence(item, today, completeChore, uncompleteChore, creditMemberId);

  return (
    <div className="chores-view">
      <header className="chores-view-header">
        <h1 className="chores-view-title">Chores</h1>
        {members.length > 0 && (
          <div className="settings-segment chores-tabs" role="tablist">
            {([['day', 'Day'], ['manage', 'Manage']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`settings-segment-btn ${tab === id ? 'settings-segment-btn--active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {members.length > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => openAddForm()}
          >
            <Plus size={16} strokeWidth={2} />
            Add Chore
          </button>
        )}
      </header>

      {members.length === 0 ? (
        <div className="chores-empty">
          Add family members first to assign chores.
        </div>
      ) : tab === 'manage' ? (
        <ManageChoresView
          chores={chores}
          members={members}
          currencySymbol={settings.currencySymbol}
          onAdd={() => openAddForm()}
          onEdit={handleStartEdit}
          onDelete={handleDeleteChore}
        />
      ) : (
        <DayChoresView
          chores={chores}
          completions={completions}
          members={members}
          today={today}
          currencySymbol={settings.currencySymbol}
          getStreakForMember={getStreakForMember}
          onToggle={handleToggle}
          onAdd={openAddForm}
        />
      )}

      {showForm && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isEditing ? 'Edit Chore' : 'New Chore'}</h2>
              <button type="button" className="modal-close" onClick={handleCloseForm}>
                {'\u00D7'}
              </button>
            </div>

            <div className="modal-body chores-add-form">
              {/* Icon picker */}
              <div className="form-field">
                <label className="form-label">Icon</label>
                <div className="fm-avatar-grid">
                  {CHORE_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`fm-avatar-option ${newChore.icon === icon ? 'fm-avatar-option--selected' : ''}`}
                      onClick={() => setNewChore((f) => ({ ...f, icon }))}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={newChore.name}
                  onChange={(e) => setNewChore((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Vacuum living room"
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label className="form-label">Value</label>
                <div className="chores-value-input">
                  <span className="chores-value-prefix">
                    {settings.currencySymbol === STAR_CURRENCY ? STAR_CURRENCY : '$'}
                  </span>
                  <input
                    type="number"
                    className="form-input"
                    value={
                      settings.currencySymbol === STAR_CURRENCY
                        ? Math.round(newChore.value_cents / 100).toString()
                        : (newChore.value_cents / 100).toFixed(2)
                    }
                    onChange={(e) =>
                      setNewChore((f) => ({
                        ...f,
                        value_cents:
                          settings.currencySymbol === STAR_CURRENCY
                            ? Math.round(parseFloat(e.target.value || '0')) * 100
                            : Math.round(parseFloat(e.target.value || '0') * 100),
                      }))
                    }
                    step={settings.currencySymbol === STAR_CURRENCY ? '1' : '0.25'}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Schedule</label>
                <ScheduleEditor
                  value={newChore.schedule}
                  onChange={(schedule) => setNewChore((f) => ({ ...f, schedule }))}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Assign To</label>
                <div className="chores-assign-grid">
                  {members.map((m: FamilyMember) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`chores-assign-btn ${newChore.assigned_to.includes(m.id) ? 'chores-assign-btn--active' : ''}`}
                      onClick={() => toggleAssigned(m.id)}
                      style={
                        newChore.assigned_to.includes(m.id)
                          ? { borderColor: m.color, backgroundColor: m.color + '15' }
                          : {}
                      }
                    >
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
                {newChore.assigned_to.length > 1 && (
                  <label className="chores-shared-toggle">
                    <input
                      type="checkbox"
                      checked={newChore.shared}
                      onChange={(e) => setNewChore((f) => ({ ...f, shared: e.target.checked }))}
                    />
                    <span>
                      <strong>Shared</strong> — done once by whoever gets to it
                      <span className="chores-shared-hint">
                        {newChore.shared ? '' : 'Otherwise each person does their own.'}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>

            <div className="modal-footer">
              {isEditing && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => handleDeleteChore(editingChoreId)}
                >
                  Delete
                </button>
              )}
              <div className="modal-footer-right">
                <button type="button" className="btn btn--secondary" onClick={handleCloseForm}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveChore}
                  disabled={!newChore.name.trim() || (newChore.schedule.type === 'weekly' && newChore.schedule.days.length === 0)}
                >
                  {isEditing ? 'Save Changes' : 'Add Chore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

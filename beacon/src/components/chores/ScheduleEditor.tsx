import { ChoreSchedule, Weekday } from '../../types/family';
import { describeSchedule, weekdayOf } from '../../api/chore-schedule';
import { localDayKey } from '../../api/date-keys';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

type ScheduleType = ChoreSchedule['type'];

const TYPE_OPTIONS: Array<{ value: ScheduleType; label: string }> = [
  { value: 'weekly', label: 'Days of the week' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'after', label: 'After last done' },
  { value: 'once', label: 'One time' },
];

/** A sensible starting schedule of each type, anchored on `today`. */
function defaultFor(type: ScheduleType, today: string): ChoreSchedule {
  switch (type) {
    case 'weekly': return { type, days: [...ALL_DAYS], every: 1, start: today };
    case 'monthly': return { type, every: 1, day: Number(today.slice(8, 10)), start: today };
    case 'after': return { type, every: 2, unit: 'week', start: today };
    case 'once': return { type, date: today };
  }
}

export function defaultSchedule(): ChoreSchedule {
  return defaultFor('weekly', localDayKey());
}

function presets(today: string): Array<{ label: string; schedule: ChoreSchedule }> {
  const weekday = weekdayOf(today);
  return [
    { label: 'Every day', schedule: { type: 'weekly', days: [...ALL_DAYS], every: 1, start: today } },
    { label: 'Weekdays', schedule: { type: 'weekly', days: [1, 2, 3, 4, 5], every: 1, start: today } },
    { label: 'Weekly', schedule: { type: 'weekly', days: [weekday], every: 1, start: today } },
    { label: 'Every 2 weeks', schedule: { type: 'weekly', days: [weekday], every: 2, start: today } },
    { label: 'Monthly', schedule: { type: 'monthly', every: 1, day: Number(today.slice(8, 10)), start: today } },
    { label: 'Quarterly', schedule: { type: 'monthly', every: 3, day: Number(today.slice(8, 10)), start: today } },
  ];
}

function NumberInput({ value, onChange, max = 99 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <input
      type="number"
      className="form-input schedule-number"
      min={1}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.min(max, Math.max(1, Math.round(Number(e.target.value) || 1))))}
    />
  );
}

interface ScheduleEditorProps {
  value: ChoreSchedule;
  onChange: (schedule: ChoreSchedule) => void;
}

/** Picks when a chore is due: weekdays, monthly, after last done, or one time. */
export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  const today = localDayKey();
  const set = (patch: Partial<ChoreSchedule>) => onChange({ ...value, ...patch } as ChoreSchedule);

  return (
    <div className="schedule-editor">
      <div className="schedule-presets">
        {presets(today).map((p) => (
          <button
            key={p.label}
            type="button"
            className={`chores-assign-btn schedule-preset ${describeSchedule(p.schedule) === describeSchedule(value) ? 'chores-assign-btn--active' : ''}`}
            onClick={() => onChange(p.schedule)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="settings-segment schedule-type">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`settings-segment-btn ${value.type === opt.value ? 'settings-segment-btn--active' : ''}`}
            onClick={() => value.type !== opt.value && onChange(defaultFor(opt.value, today))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.type === 'weekly' && (
        <>
          <div className="schedule-days" role="group" aria-label="Days">
            {ALL_DAYS.map((d) => {
              const on = value.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`schedule-day ${on ? 'schedule-day--on' : ''}`}
                  aria-pressed={on}
                  aria-label={DAY_NAMES[d]}
                  onClick={() => set({ days: on ? value.days.filter((x) => x !== d) : [...value.days, d].sort() })}
                >
                  {DAY_LETTERS[d]}
                </button>
              );
            })}
          </div>
          <div className="schedule-row">
            <span>Every</span>
            <NumberInput value={value.every} onChange={(every) => set({ every })} max={52} />
            <span>{value.every === 1 ? 'week' : 'weeks'}</span>
            {value.every > 1 && (
              <>
                <span>starting the week of</span>
                <input type="date" className="form-input schedule-date" value={value.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
              </>
            )}
          </div>
        </>
      )}

      {value.type === 'monthly' && (
        <>
          <div className="schedule-row">
            <span>Every</span>
            <NumberInput value={value.every} onChange={(every) => set({ every })} max={24} />
            <span>{value.every === 1 ? 'month' : 'months'}</span>
            <span>starting</span>
            <input type="date" className="form-input schedule-date" value={value.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
          </div>
          <div className="schedule-row">
            <label className="schedule-radio">
              <input
                type="radio"
                checked={value.day !== undefined}
                onChange={() => set({ day: Number(value.start.slice(8, 10)), nth: undefined, weekday: undefined })}
              />
              On day
            </label>
            <NumberInput
              value={value.day ?? Number(value.start.slice(8, 10))}
              onChange={(day) => set({ day, nth: undefined, weekday: undefined })}
              max={31}
            />
          </div>
          <div className="schedule-row">
            <label className="schedule-radio">
              <input
                type="radio"
                checked={value.day === undefined}
                onChange={() => set({ day: undefined, nth: 1, weekday: weekdayOf(value.start) })}
              />
              On the
            </label>
            <select
              className="form-select schedule-select"
              value={value.nth ?? 1}
              onChange={(e) => set({ day: undefined, nth: Number(e.target.value) as 1 | 2 | 3 | 4 | -1, weekday: value.weekday ?? weekdayOf(value.start) })}
            >
              <option value={1}>first</option>
              <option value={2}>second</option>
              <option value={3}>third</option>
              <option value={4}>fourth</option>
              <option value={-1}>last</option>
            </select>
            <select
              className="form-select schedule-select"
              value={value.weekday ?? weekdayOf(value.start)}
              onChange={(e) => set({ day: undefined, nth: value.nth ?? 1, weekday: Number(e.target.value) as Weekday })}
            >
              {DAY_NAMES.map((name, d) => <option key={d} value={d}>{name}</option>)}
            </select>
          </div>
        </>
      )}

      {value.type === 'after' && (
        <div className="schedule-row">
          <span>Every</span>
          <NumberInput value={value.every} onChange={(every) => set({ every })} max={365} />
          <select className="form-select schedule-select" value={value.unit} onChange={(e) => set({ unit: e.target.value as 'day' | 'week' | 'month' })}>
            <option value="day">{value.every === 1 ? 'day' : 'days'}</option>
            <option value="week">{value.every === 1 ? 'week' : 'weeks'}</option>
            <option value="month">{value.every === 1 ? 'month' : 'months'}</option>
          </select>
          <span>after it's done, first due</span>
          <input type="date" className="form-input schedule-date" value={value.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        </div>
      )}

      {value.type === 'once' && (
        <div className="schedule-row">
          <span>On</span>
          <input type="date" className="form-input schedule-date" value={value.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </div>
      )}

      <div className="schedule-summary">{describeSchedule(value)}</div>
    </div>
  );
}

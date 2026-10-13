import { useMemo } from 'react';
import { format, parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent } from '../types';
import { FamilyMember } from '../types/family';
import type { ChoreOccurrence } from '../api/chore-schedule';
import { TaskChecklist } from './TaskChecklist';
import { DashboardTodoItem } from '../hooks/useDashboardTasks';
import { useTranslation } from '../i18n';

interface CalendarSidebarProps {
  events: CalendarEvent[];
  choreItems: ChoreOccurrence[];
  today: string;
  onToggleChoreItem: (item: ChoreOccurrence, creditMemberId?: string) => void;
  todoItems: DashboardTodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string) => void;
  members?: FamilyMember[];
}

export function CalendarSidebar({
  events,
  choreItems,
  today: todayKey,
  onToggleChoreItem,
  todoItems,
  onToggleTodo,
  members = [],
}: CalendarSidebarProps) {
  const { t, dateLocale } = useTranslation();
  const today = startOfDay(new Date());

  const todayEvents = useMemo(() => {
    return events
      .filter((e) => isSameDay(startOfDay(parseISO(e.start)), today))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, today]);

  const pendingTodos = todoItems.filter((t) => t.status === 'needs_action');

  return (
    <aside className="calendar-sidebar">
      {/* Today's Schedule */}
      <section className="cal-sidebar-section">
        <h3 className="cal-sidebar-heading">{t('calendarSidebar.today')}</h3>
        {todayEvents.length === 0 ? (
          <p className="cal-sidebar-empty">{t('calendarSidebar.nothingScheduled')}</p>
        ) : (
          <ul className="cal-sidebar-events">
            {todayEvents.map((event) => (
              <li key={event.id} className="cal-sidebar-event">
                <span
                  className="cal-sidebar-event-dot"
                  style={{ background: event.color || 'var(--accent)' }}
                />
                <div className="cal-sidebar-event-info">
                  <span className="cal-sidebar-event-title">{event.title}</span>
                  {event.start.includes('T') && (
                    <span className="cal-sidebar-event-time">
                      {format(parseISO(event.start), 'h:mm a', { locale: dateLocale })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks / Chores */}
      <section className="cal-sidebar-section">
        <h3 className="cal-sidebar-heading">{t('calendarSidebar.tasks')}</h3>
        {pendingTodos.length > 0 && onToggleTodo ? (
          <ul className="cal-sidebar-todos">
            {pendingTodos.slice(0, 8).map((item) => (
              <li key={item.uid} className="cal-sidebar-todo">
                <button
                  type="button"
                  className="cal-sidebar-todo-check"
                  onClick={() => onToggleTodo(item.uid, item.status)}
                  aria-label={t('calendarSidebar.completeItem', { name: item.summary })}
                >
                  <span className="task-checkbox-box" />
                </button>
                <span className="cal-sidebar-todo-label">{item.summary}</span>
              </li>
            ))}
          </ul>
        ) : choreItems.length > 0 ? (
          <TaskChecklist
            items={choreItems}
            today={todayKey}
            onToggle={onToggleChoreItem}
            members={members}
          />
        ) : (
          <p className="cal-sidebar-empty">{t('calendarSidebar.allClear')}</p>
        )}
      </section>
    </aside>
  );
}

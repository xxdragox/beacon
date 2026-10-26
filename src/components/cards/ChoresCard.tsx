import { DashboardCardProps } from '../../types/dashboard-cards';
import { TaskChecklist } from '../TaskChecklist';
import { useTranslation } from '../../i18n';

/** Sidebar "Chores" section — today's (and overdue) chore checklist, shown regardless of HA todo items. */
export function ChoresCard({ context }: DashboardCardProps) {
  const { t } = useTranslation();
  const { choreItems, today, onToggleChoreItem, members, selectedMemberFilter } = context;

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">{t('nav.chores')}</h3>
      <TaskChecklist
        items={choreItems}
        today={today}
        onToggle={onToggleChoreItem}
        members={members}
        creditMemberId={selectedMemberFilter}
      />
    </section>
  );
}

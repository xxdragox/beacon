import { format } from 'date-fns';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { useTranslation } from '../../i18n';
import { MEAL_ICONS } from './MenuCard';

/** "Week Menu" — planned meals for today and the next six days. */
export function WeekMenuCard({ config, context }: DashboardCardProps) {
  const { t, dateLocale } = useTranslation();
  const dinnerOnly = config.dinner_only === true;

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">{t('dashboard.weekMenu')}</h3>
      <ul className="week-menu-days">
        {context.weekMenu.map((day, i) => {
          const meals = dinnerOnly ? day.meals.filter((m) => m.meal_type === 'Dinner') : day.meals;
          const [y, m, d] = day.date.split('-').map(Number);
          const date = new Date(y, m - 1, d);
          const label = i === 0
            ? t('common.today')
            : i === 1 ? t('common.tomorrow') : format(date, 'EEEE', { locale: dateLocale });
          return (
            <li key={day.date} className={`week-menu-day${i === 0 ? ' week-menu-day--today' : ''}`}>
              <div className="week-menu-day-label">
                <span>{label}</span>
                <span className="week-menu-day-date">{format(date, 'MMM d', { locale: dateLocale })}</span>
              </div>
              {meals.length === 0 ? (
                <span className="week-menu-empty">{t('dashboard.nothingPlanned')}</span>
              ) : (
                <ul className="week-menu-meals">
                  {meals.map((meal, j) => (
                    <li key={j} className="week-menu-meal">
                      <span className="dash-menu-icon" aria-hidden="true">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                      <span className="dash-menu-name">{meal.name}</span>
                      {!dinnerOnly && <span className="dash-menu-type">{meal.meal_type}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

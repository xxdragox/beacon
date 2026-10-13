import { useEffect, useState } from 'react';
import { Chore, ChoreCompletion } from '../types/family';
import { ChoreOccurrence, canToggle, occurrencesForDay } from '../api/chore-schedule';
import { localDayKey } from '../api/date-keys';

/** Today's local date ("YYYY-MM-DD"), updating when the day rolls over. */
export function useTodayKey(): string {
  const [today, setToday] = useState(localDayKey);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = localDayKey();
      setToday((prev) => (prev === now ? prev : now));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

/** Whether an occurrence belongs on `memberId`'s list (their own, or a shared/open chore they can do). */
export function occurrenceIsFor(o: ChoreOccurrence, memberId: string): boolean {
  if (o.memberId !== null) return o.memberId === memberId;
  return o.chore.assigned_to.length === 0 || o.chore.assigned_to.includes(memberId);
}

/** Every chore occurrence to show on `date` (today also includes overdue ones), optionally for one person. */
export function choreItemsForDay(
  chores: Chore[],
  completions: ChoreCompletion[],
  date: string,
  today: string,
  memberId?: string | null,
): ChoreOccurrence[] {
  const items = chores.flatMap((c) => occurrencesForDay(c, completions, date, today));
  return memberId ? items.filter((o) => occurrenceIsFor(o, memberId)) : items;
}

export type ChoreCompleteFn = (choreId: string, memberId: string, dueDate?: string, anyMember?: boolean) => Promise<void> | void;

/**
 * Check off or undo one occurrence. Individual occurrences credit their own
 * person; shared/open ones credit `creditMemberId` (who did it).
 */
export function toggleOccurrence(
  occurrence: ChoreOccurrence,
  today: string,
  complete: ChoreCompleteFn,
  uncomplete: ChoreCompleteFn,
  creditMemberId?: string,
) {
  if (!canToggle(occurrence, today)) return;
  const shared = occurrence.memberId === null;
  if (occurrence.state === 'done') {
    const who = occurrence.completion?.member_id ?? occurrence.memberId;
    if (who) return uncomplete(occurrence.chore.id, who, occurrence.dueDate, shared);
    return;
  }
  const who = occurrence.memberId ?? creditMemberId;
  if (who) return complete(occurrence.chore.id, who, occurrence.dueDate, shared);
}

/** Stable React key for an occurrence. */
export function occurrenceKey(o: ChoreOccurrence): string {
  return `${o.chore.id}|${o.memberId ?? '*'}|${o.dueDate}`;
}

export interface FamilyMember {
  id: string;
  name: string;
  avatar: string; // emoji or image URL
  color: string; // hex color
  pin?: string; // 4-6 digit PIN
  role: 'parent' | 'child';
  calendar_entity?: string; // HA calendar entity_id (primary calendar)
  /** Additional HA calendar entity_ids linked to this member (e.g. a
   *  kid's sports team calendar), so their events group under this member
   *  too instead of falling into the "Other" bucket. `calendar_entity`
   *  remains the primary/back-compat single-calendar field. */
  additional_calendar_entities?: string[];
}

/** 0 = Sunday … 6 = Saturday (Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * When a chore is due. Dates are local "YYYY-MM-DD" strings.
 * - weekly:  on the given weekdays, every `every` weeks counted from `start`
 * - monthly: every `every` months counted from `start`, on day-of-month `day`
 *            (clamped to the month's length) or on the `nth` (1–4, -1 = last)
 *            `weekday` of the month
 * - after:   `every` days/weeks/months after it was last done (first due on `start`)
 * - once:    on `date` only
 */
export type ChoreSchedule =
  | { type: 'weekly'; days: Weekday[]; every: number; start: string }
  | { type: 'monthly'; every: number; start: string; day?: number; nth?: 1 | 2 | 3 | 4 | -1; weekday?: Weekday }
  | { type: 'after'; every: number; unit: 'day' | 'week' | 'month'; start: string }
  | { type: 'once'; date: string };

export interface Chore {
  id: string;
  name: string;
  assigned_to: string[]; // member IDs
  /** When it's due. Chores saved before scheduling only have `frequency`; see chore-schedule.ts scheduleOf(). */
  schedule?: ChoreSchedule;
  /** Legacy (upstream) frequency, never acted on. Kept for reading old data. */
  frequency?: 'daily' | 'weekly' | 'once';
  /** Done once by whichever assignee gets to it, instead of each assignee doing their own. */
  shared?: boolean;
  value_cents: number;
  icon?: string; // emoji
}

export interface ChoreCompletion {
  chore_id: string;
  member_id: string;
  completed_at: string; // ISO date string for serialization
  /** The occurrence ("YYYY-MM-DD") this completion satisfies. Older completions lack it; their local completion day stands in. */
  due_date?: string;
  verified_by?: string; // member ID of verifying parent
}

export interface Streak {
  member_id: string;
  current: number;
  longest: number;
  last_completed: string; // ISO date string
}

export interface Routine {
  id: string;
  name: string;
  member_id: string;
  tasks: RoutineTask[];
  time_of_day: 'morning' | 'afternoon' | 'evening';
}

export interface RoutineTask {
  id: string;
  name: string;
  order: number;
}

/** A member checking off one routine task on one day (mirrors ChoreCompletion) */
export interface RoutineTaskCompletion {
  routine_id: string;
  task_id: string;
  member_id: string;
  completed_at: string; // ISO date string for serialization
}

/** Earnings for a member over a time period */
export interface MemberEarnings {
  member_id: string;
  total_cents: number;
  chore_count: number;
}

/** Non-monetary "star" unit, selectable alongside currency symbols in
 *  Settings → Chores → Rewards for families that prefer points over money. */
export const STAR_CURRENCY = '\u2b50';

/** Format a chore's value_cents for display, honoring the star-currency
 *  option. In star mode the underlying value_cents is still the storage
 *  unit (so existing chore data / math is unchanged) but it's presented as
 *  a whole-number star count rather than a monetary amount with decimals. */
export function formatChoreValue(cents: number, currencySymbol: string): string {
  if (cents === 0) return '';
  if (currencySymbol === STAR_CURRENCY) {
    const stars = Math.round(cents / 100);
    return `${stars} ${STAR_CURRENCY}`;
  }
  return `${currencySymbol}${(cents / 100).toFixed(2)}`;
}

/** Color palette for family member assignment */
export const MEMBER_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#ef4444', // red
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#0ea5e9', // sky
  '#fb923c', // amber
  '#2dd4bf', // mint
  '#a3e635', // chartreuse
  '#c084fc', // lavender
  '#38bdf8', // light blue
] as const;

/** Avatar categories for the picker UI */
export interface AvatarCategory {
  label: string;
  emojis: string[];
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    label: 'People',
    emojis: [
      '👦', '👧', '👨', '👩', '👴', '👵', '🧑', '👶', '🧒', '👸', '🤴', '🦸',
      '👩‍🦰', '👨‍🦱', '🧔', '👱', '👩‍🦳', '👨‍🦳', '👩‍🦲', '🧑‍🦱',
      '🧑‍🦰', '🧑‍🦳', '👮', '🧙', '🧝', '🧛', '🧜', '🧚', '🦹', '🥷',
      '👼', '🤠', '🥸', '🤓', '😎', '🧑‍🚀', '🧑‍🎤', '🧑‍🎓', '🧑‍🍳', '🧑‍🔧',
    ],
  },
  {
    label: 'Animals',
    emojis: [
      '🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🦁', '🐮', '🐷', '🐸',
      '🦉', '🐝', '🦋', '🐢', '🐙', '🐧', '🦄', '🐬', '🐳', '🦈',
      '🦅', '🦜', '🐺', '🦝', '🐿️', '🦔', '🐾', '🦩', '🦖', '🐉',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '🌸', '🌻', '🌺', '🍀', '🌈', '⭐', '🌙', '☀️', '🔥',
      '❄️', '🌊', '⚡', '🌍', '🪐', '💫', '🍂', '🌿', '🌴',
    ],
  },
  {
    label: 'Sports & Hobbies',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏒', '🎸', '🎹', '🎨',
      '🎮', '🎯', '🎳', '🏄', '🚴', '🏋️', '🤸', '⛷️', '🏊', '🧗',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🚀', '🎭', '🎪', '🎠', '🏰', '🗽', '⛺', '🎡', '🎢',
      '💎', '🔮', '🎀', '🧸', '🎒', '👑', '🦺', '🧢', '👓',
    ],
  },
  {
    label: 'Food',
    emojis: [
      '🍕', '🍦', '🧁', '🍩', '🎂', '🍔', '🌮', '🍣', '🥑',
      '🍪', '🧇', '🍫', '☕', '🧋', '🍓', '🍉', '🥝', '🍑',
    ],
  },
];

/** Flat list of all avatar emojis (for backwards compat) */
export const AVATAR_OPTIONS = AVATAR_CATEGORIES.flatMap((c) => c.emojis);

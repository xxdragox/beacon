export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Side' | 'Dessert' | 'Snack' | 'Drink';

/** Display order of meal types within a day. */
export const MEAL_TYPE_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Side', 'Dessert', 'Snack', 'Drink'];

export interface MealPlanEntry {
  date: string;       // YYYY-MM-DD
  meal_type: MealType;
  name: string;
  recipe_id?: string;
}

export interface DayMenu {
  date: string;
  meals: MealPlanEntry[];
}

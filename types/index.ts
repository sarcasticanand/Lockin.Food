// ============================================================
// LOCKIN.FOOD — TypeScript Interfaces
// ============================================================

export type Goal = 'fat_loss' | 'muscle_gain' | 'clean_eating' | 'manage_condition';
export type Sex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active';
export type Region = 'north' | 'south' | 'east' | 'west' | 'other';
export type CookingTime = 'under_15' | '15_30' | '30_45' | '45_plus';
export type PantryStatus = 'fresh' | 'low' | 'expired' | 'out';
export type MealSlot = 'early_morning' | 'breakfast' | 'mid_morning' | 'lunch' | 'evening_snack' | 'dinner' | 'pre_bed';

// ============================================================
// USER
// ============================================================
export interface User {
  id: string;
  telegram_chat_id: number;
  telegram_username?: string;
  created_at: string;
  updated_at: string;

  // Health
  goal?: Goal;
  condition?: string;
  target_kg?: number;
  target_weeks?: number;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  sex?: Sex;
  activity_level?: ActivityLevel;

  // Diet
  okay_with_dairy: boolean;
  okay_with_eggs: boolean;
  okay_with_meat_fish: boolean;
  food_style?: string[];
  food_style_notes?: string;
  allergies?: string[];
  dislikes?: string[];
  dislikes_notes?: string;

  // Fitness
  works_out: boolean;
  workout_type?: string;
  workout_days?: string[];
  workout_time?: string;

  // Logistics
  region?: Region;
  budget_weekly?: number;
  max_cooking_time?: CookingTime;
  wake_time: string;
  sleep_time: string;

  // Computed macros
  bmi?: number;
  bmr?: number;
  tdee?: number;
  target_kcal?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;

  // State
  onboarding_complete: boolean;
  current_streak: number;
  total_days_tracked: number;
}

// ============================================================
// MACRO TARGETS (output of macro-calculator)
// ============================================================
export interface MacroTargets {
  bmi: number;
  bmr: number;
  tdee: number;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  weekly_rate_kg: number;
  workout_day_kcal: number;
  rest_day_kcal: number;
}

// ============================================================
// MEAL PLAN
// ============================================================
export interface PlateComponent {
  role: 'main' | 'carb_base' | 'side' | 'accompaniment' | 'protein_add';
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ShoppingIngredient {
  name: string;
  qty: number;
  unit: string;
  category?: string;
}

export interface ComposedPlate {
  time: string;
  name: string;
  components: PlateComponent[];
  plate_totals: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  ingredients: ShoppingIngredient[];
  instructions: string[];
  why_this_plate: string;
}

export interface SimpleSlot {
  time: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
}

export interface Workout {
  type: string;
  exercises: WorkoutExercise[];
  duration_min: number;
  pre_workout: string;
  post_workout: string;
}

export interface DayPlan {
  day: string;
  is_workout_day: boolean;
  target_kcal: number;
  slots: {
    early_morning: SimpleSlot;
    breakfast: ComposedPlate;
    mid_morning: SimpleSlot;
    lunch: ComposedPlate;
    evening_snack: SimpleSlot | ComposedPlate;
    dinner: ComposedPlate;
    pre_bed: SimpleSlot;
  };
  day_totals: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  workout?: Workout;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start: string;
  created_at: string;
  plan_data: {
    days: DayPlan[];
  };
  is_active: boolean;
}

// ============================================================
// DAILY LOG
// ============================================================
export interface MealLogged {
  slot: MealSlot;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  meals_eaten: MealLogged[];
  meals_skipped: MealSlot[];
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  weight_log?: number;
  notes?: string;
  created_at: string;
}

// ============================================================
// PANTRY
// ============================================================
export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  purchased_date: string;
  est_depletion_date?: string;
  status: PantryStatus;
  created_at: string;
}

// ============================================================
// SHOPPING
// ============================================================
export interface ShoppingList {
  id: string;
  user_id: string;
  created_at: string;
  items: ShoppingListItem[];
  total_estimated_cost?: number;
  ordered: boolean;
  ordered_at?: string;
  order_source: 'manual' | 'instamart';
}

export interface ShoppingListItem {
  name: string;
  qty: number;
  unit: string;
  category?: string;
  estimated_cost?: number;
  checked: boolean;
  in_pantry: boolean;
}

// ============================================================
// CONFIG
// ============================================================
export interface FeatureFlags {
  instamart_enabled: boolean;
  workout_plans_enabled: boolean;
  pantry_tracking_enabled: boolean;
  weekly_reports_enabled: boolean;
  morning_briefing_enabled: boolean;
  max_free_messages_per_day: number;
}

export interface InstamartConfig {
  enabled: boolean;
  mcp_url: string;
  attribution_text: string;
  auto_checkout: boolean;
  require_user_confirmation: boolean;
}

// ============================================================
// ONBOARDING FORM STATE
// ============================================================
export interface OnboardingProfile {
  telegramChatId: number;
  goal?: Goal;
  condition?: string;
  target_kg?: number;
  target_weeks?: number;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  sex?: Sex;
  activity_level?: ActivityLevel;
  okay_with_dairy: boolean;
  okay_with_eggs: boolean;
  okay_with_meat_fish: boolean;
  food_style: string[];
  food_style_notes: string;
  allergies: string[];
  dislikes: string[];
  dislikes_notes: string;
  works_out: boolean;
  workout_type?: string;
  workout_days: string[];
  workout_time?: string;
  region?: Region;
  budget_weekly: number;
  max_cooking_time?: CookingTime;
  wake_time: string;
  sleep_time: string;
}

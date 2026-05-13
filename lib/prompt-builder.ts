import { getServerClient } from './supabase';

// Lazy getter — avoids module-level createClient() during build
function db() { return getServerClient(); }

// Cache the prompt template for 5 minutes — avoid a DB round-trip on every message
let promptCache: Record<string, { template: string; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPromptTemplate(key: string = 'system_prompt_template'): Promise<string> {
  const cached = promptCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.template;
  }

  const { data, error } = await db()
    .from('config')
    .select('value')
    .eq('key', key)
    .single();

  if (error) {
    console.error(`[prompt-builder] Failed to load ${key}:`, error.message);
    return '';
  }

  // The value is stored as a JSON string in the DB (the SQL inserts it as a JSON string literal)
  const template = typeof data?.value === 'string' ? data.value : JSON.stringify(data?.value || '');
  promptCache[key] = { template, timestamp: Date.now() };
  return template;
}

export async function getFeatureFlags(): Promise<Record<string, unknown>> {
  const { data } = await db()
    .from('config')
    .select('value')
    .eq('key', 'features')
    .single();
  return (data?.value as Record<string, unknown>) || {};
}

export async function getInstamartConfig(): Promise<Record<string, unknown>> {
  const { data } = await db()
    .from('config')
    .select('value')
    .eq('key', 'instamart_config')
    .single();
  return (data?.value as Record<string, unknown>) || { enabled: false };
}

// Invalidate cache (call after editing config in Supabase)
export function invalidatePromptCache() {
  promptCache = {};
}

export async function buildSystemPrompt(
  user: Record<string, unknown>,
  plan: Record<string, unknown> | null,
  pantry: Record<string, unknown>[],
  todayLog: Record<string, unknown> | null
): Promise<string> {
  const template = await getPromptTemplate('system_prompt_template');

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const workoutDays = (user.workout_days as string[]) || [];
  const isWorkoutDay = workoutDays.includes(dayName);
  const targetKcal = (user.target_kcal as number) || 2000;
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;

  // Extract today's plan from active week plan (0 = Sunday offset)
  const dayIndex = today.getDay(); // 0 = Sun
  const planData = plan?.plan_data as { days?: Record<string, unknown>[] } | undefined;
  const todayPlan = planData?.days?.[dayIndex];

  // Diet summary
  const dietParts: string[] = [];
  if (user.okay_with_dairy) dietParts.push('dairy ok'); else dietParts.push('no dairy');
  if (user.okay_with_eggs) dietParts.push('eggs ok'); else dietParts.push('no eggs');
  if (user.okay_with_meat_fish) dietParts.push('meat/fish ok'); else dietParts.push('no meat/fish');

  // Workout summary
  const workoutSummary = user.works_out
    ? `Yes, ${user.workout_type || 'general'} on ${workoutDays.join(', ') || 'unspecified days'}`
    : 'No regular workout';

  // Pantry summary
  const pantrySummary = pantry.length > 0
    ? pantry.map(p => `${p.name}: ${p.quantity}${p.unit} (${p.status})`).join('\n')
    : 'Empty';

  // Today's log
  const logData = todayLog as { meals_eaten?: unknown[]; total_kcal?: number; total_protein_g?: number } | null;
  const todayLogSummary = logData?.meals_eaten && logData.meals_eaten.length > 0
    ? `${JSON.stringify(logData.meals_eaten)}\nTotal so far: ${logData.total_kcal || 0} kcal, ${logData.total_protein_g || 0}g protein`
    : 'Nothing logged yet.';

  const targetInfo = user.target_kg
    ? `(${user.target_kg}kg in ${user.target_weeks} weeks)`
    : '';

  const replacements: Record<string, string> = {
    '{{username}}': (user.telegram_username as string) || 'there',
    '{{goal}}': (user.goal as string) || 'not set',
    '{{target_info}}': targetInfo,
    '{{height_cm}}': String(user.height_cm || ''),
    '{{weight_kg}}': String(user.weight_kg || ''),
    '{{age}}': String(user.age || ''),
    '{{sex}}': (user.sex as string) || '',
    '{{activity_level}}': (user.activity_level as string) || '',
    '{{diet_summary}}': dietParts.join(', '),
    '{{food_style}}': ((user.food_style as string[]) || []).join(', ') || 'not specified',
    '{{food_style_notes}}': (user.food_style_notes as string) || '',
    '{{region}}': (user.region as string) || 'not specified',
    '{{dislikes}}': ((user.dislikes as string[]) || []).join(', ') || 'none',
    '{{dislikes_notes}}': (user.dislikes_notes as string) || '',
    '{{allergies}}': ((user.allergies as string[]) || []).join(', ') || 'none',
    '{{budget_weekly}}': String(user.budget_weekly || ''),
    '{{max_cooking_time}}': (user.max_cooking_time as string) || '',
    '{{workout_summary}}': workoutSummary,
    '{{day_kcal}}': String(dayKcal),
    '{{day_type}}': isWorkoutDay ? 'workout day +12%' : 'rest day',
    '{{target_protein_g}}': String(user.target_protein_g || ''),
    '{{target_carbs_g}}': String(user.target_carbs_g || ''),
    '{{target_fat_g}}': String(user.target_fat_g || ''),
    '{{today_date}}': today.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
    '{{workout_or_rest}}': isWorkoutDay
      ? `WORKOUT DAY: ${user.workout_type} scheduled`
      : 'REST DAY',
    '{{today_plan}}': todayPlan ? JSON.stringify(todayPlan, null, 2) : 'No plan generated yet.',
    '{{today_log}}': todayLogSummary,
    '{{pantry_summary}}': pantrySummary,
    '{{streak}}': String(user.current_streak || 0),
    '{{target_kcal}}': String(targetKcal),
    '{{workout_day_kcal}}': String(Math.round(targetKcal * 1.12)),
    '{{workout_days}}': workoutDays.join(', ') || 'none',
    '{{workout_type}}': (user.workout_type as string) || 'none',
    '{{meal_preps}}': user.meal_preps ? 'Yes, batch cooks on weekends' : 'No',
  };

  return applyReplacements(template, replacements);
}

export async function buildMealPlanPrompt(
  user: Record<string, unknown>,
  pantry: Record<string, unknown>[]
): Promise<string> {
  const template = await getPromptTemplate('meal_plan_prompt_template');

  const dietParts: string[] = [];
  if (user.okay_with_dairy) dietParts.push('dairy ok'); else dietParts.push('no dairy');
  if (user.okay_with_eggs) dietParts.push('eggs ok'); else dietParts.push('no eggs');
  if (user.okay_with_meat_fish) dietParts.push('meat/fish ok'); else dietParts.push('no meat/fish');

  const pantrySummary = pantry.length > 0
    ? pantry.map(p => `${p.name}: ${p.quantity}${p.unit}`).join(', ')
    : 'Empty';

  const targetKcal = (user.target_kcal as number) || 2000;
  const workoutDays = (user.workout_days as string[]) || [];

  const replacements: Record<string, string> = {
    '{{goal}}': (user.goal as string) || '',
    '{{target_info}}': user.target_kg ? `(${user.target_kg}kg in ${user.target_weeks} weeks)` : '',
    '{{target_kcal}}': String(targetKcal),
    '{{workout_day_kcal}}': String(Math.round(targetKcal * 1.12)),
    '{{target_protein_g}}': String(user.target_protein_g || ''),
    '{{target_carbs_g}}': String(user.target_carbs_g || ''),
    '{{target_fat_g}}': String(user.target_fat_g || ''),
    '{{diet_summary}}': dietParts.join(', '),
    '{{food_style}}': ((user.food_style as string[]) || []).join(', ') || '',
    '{{food_style_notes}}': (user.food_style_notes as string) || '',
    '{{region}}': (user.region as string) || '',
    '{{dislikes}}': ((user.dislikes as string[]) || []).join(', ') || 'none',
    '{{dislikes_notes}}': (user.dislikes_notes as string) || '',
    '{{allergies}}': ((user.allergies as string[]) || []).join(', ') || 'none',
    '{{max_cooking_time}}': (user.max_cooking_time as string) || '',
    '{{workout_days}}': workoutDays.join(', ') || 'none',
    '{{workout_type}}': (user.workout_type as string) || 'none',
    '{{pantry_summary}}': pantrySummary,
  };

  return applyReplacements(template, replacements);
}

function applyReplacements(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

import { getServerClient } from './supabase'

let _cache: Record<string, { value: string; ts: number }> = {}
const TTL = 5 * 60 * 1000

async function getConfig(key: string): Promise<string> {
  const cached = _cache[key]
  if (cached && Date.now() - cached.ts < TTL) return cached.value

  const { data } = await getServerClient().from('config').select('value').eq('key', key).single()
  const value = typeof data?.value === 'string' ? data.value : JSON.stringify(data?.value ?? '')
  _cache[key] = { value, ts: Date.now() }
  return value
}

export async function getFeatureFlags(): Promise<Record<string, unknown>> {
  const { data } = await getServerClient().from('config').select('value').eq('key', 'features').single()
  return (data?.value as Record<string, unknown>) ?? {}
}

export async function getInstamartConfig(): Promise<Record<string, unknown>> {
  const { data } = await getServerClient().from('config').select('value').eq('key', 'instamart_config').single()
  return (data?.value as Record<string, unknown>) ?? { enabled: false }
}

export function invalidatePromptCache() {
  _cache = {}
}

export async function buildSystemPrompt(
  user: Record<string, unknown>,
  plan: Record<string, unknown> | null,
  pantry: Record<string, unknown>[],
  todayLog: Record<string, unknown> | null
): Promise<string> {
  const template = await getConfig('system_prompt_template')

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
    '{{name}}': ((user.name as string) || '').split(' ')[0] || 'there',
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
  // Self-contained, India-specific prompt — does not rely on DB template
  const targetKcal = (user.target_kcal as number) || 2000;
  const workoutDayKcal = Math.round(targetKcal * 1.12);
  const workoutDays = (user.workout_days as string[]) || [];

  const dietLines: string[] = [];
  if (!user.okay_with_dairy) dietLines.push('NO dairy (no milk, paneer, curd, ghee, cheese)');
  if (!user.okay_with_eggs) dietLines.push('NO eggs');
  if (!user.okay_with_meat_fish) dietLines.push('NO meat or fish — vegetarian only');

  const wakeTime = (user.wake_time as string) || '07:00';
  const sleepTime = (user.sleep_time as string) || '23:00';

  // Derive meal times from wake/sleep, minute-accurate, anchored to both ends of the day
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const toHHMM = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const wakeMin = toMin(wakeTime);
  let sleepMin = toMin(sleepTime);
  if (sleepMin <= wakeMin) sleepMin += 1440; // sleeps past midnight
  const mealTimes = {
    early_morning: toHHMM(wakeMin + 15),
    breakfast: toHHMM(wakeMin + 75),
    mid_morning: toHHMM(wakeMin + 210),
    lunch: toHHMM(Math.min(wakeMin + 330, sleepMin - 480)),
    evening_snack: toHHMM(sleepMin - 300),
    dinner: toHHMM(sleepMin - 150),
    pre_bed: toHHMM(sleepMin - 45),
  };

  const pantrySummary = pantry.length > 0
    ? pantry.map(p => `${p.name} (${p.quantity}${p.unit})`).join(', ')
    : 'standard Indian pantry (rice, dal, roti atta, spices, oil)';

  const cookingMap: Record<string, string> = {
    under_15: 'max 15 minutes of cooking per meal — ready-to-eat, one-pan, or no-cook dishes only',
    '15_30': 'max 20-30 minutes of cooking per meal — simple, quick dishes',
    '30_45': '30-45 minutes cooking OK — can make dal, sabzi, rice from scratch',
    '45_plus': 'happy to cook 45+ minutes — elaborate meals fine',
  };
  const cookingPref = cookingMap[(user.max_cooking_time as string)] || 'moderate cooking';

  // Per-slot calorie budgets that SUM to the day target. Without these the AI
  // writes normal-sized meals (~2000 kcal) regardless of the target, so a high
  // target silently under-delivers. Percentages differ for workout days
  // (more around the pre/post-workout window).
  const restSplit = { early_morning: 0.04, breakfast: 0.22, mid_morning: 0.08, lunch: 0.28, evening_snack: 0.10, dinner: 0.24, pre_bed: 0.04 };
  const workoutSplit = { early_morning: 0.04, breakfast: 0.20, mid_morning: 0.08, lunch: 0.25, evening_snack: 0.13, dinner: 0.26, pre_bed: 0.04 };
  const budgetLines = (total: number, split: Record<string, number>) =>
    Object.entries(split).map(([slot, pct]) => `  - ${slot}: ~${Math.round(total * pct)} kcal`).join('\n');
  const restBudget = budgetLines(targetKcal, restSplit);
  const workoutBudget = budgetLines(workoutDayKcal, workoutSplit);

  const goalMap: Record<string, string> = {
    fat_loss: `Fat loss${user.target_kg ? ` (${user.target_kg}kg in ${user.target_weeks} weeks)` : ''} — ${targetKcal} kcal deficit diet. High protein to preserve muscle.`,
    muscle_gain: `Muscle gain${user.target_kg ? ` (${user.target_kg}kg in ${user.target_weeks} weeks)` : ''} — ${targetKcal} kcal surplus diet. Very high protein, adequate carbs for training fuel.`,
    clean_eating: `Clean eating at maintenance (${targetKcal} kcal). Whole foods, minimal processing.`,
    manage_condition: `Managing ${(user.condition as string) || 'a health condition'} — ${targetKcal} kcal, balanced macros, whole foods.${(user.condition_notes as string) ? ` Doctor's notes: ${user.condition_notes}` : ''}`,
  };
  const goalDesc = goalMap[(user.goal as string)] || `Goal: ${user.goal}, ${targetKcal} kcal/day`;

  return `You are a professional nutritionist and meal planner specialising in Indian cuisine. Generate a personalised 7-day meal plan in strict JSON format.

USER PROFILE (this plan is for ${(user.name as string) || 'this user'} — tailor every choice to THIS specific profile):
- Goal: ${goalDesc}
- Weight: ${user.weight_kg}kg | Height: ${user.height_cm}cm | Age: ${user.age} | Sex: ${user.sex}
- Activity: ${user.activity_level}
- Preferred cuisines: ${((user.food_style as string[]) || []).join(', ') || 'Mixed Indian'}
- Everyday food described by user: ${(user.food_style_notes as string) || 'not specified'}
- Diet restrictions: ${dietLines.length > 0 ? dietLines.join('; ') : 'None — omnivore'}
- Allergies: ${((user.allergies as string[]) || []).join(', ') || 'None'}
- Dislikes: ${((user.dislikes as string[]) || []).join(', ') || 'None'}${(user.dislikes_notes as string) ? `\n- Additional food notes: ${user.dislikes_notes}` : ''}
- Cooking time available: ${cookingPref}
- Meal preps on weekends: ${user.meal_preps ? 'Yes — batch cooking on Sat/Sun is fine, weekday meals can reuse prepped components' : 'No — each meal cooked fresh or ready-to-eat'}
- Weekly grocery budget: ₹${user.budget_weekly || 2000}
- Wake time: ${wakeTime} | Sleep time: ${sleepTime}
- Workout: ${user.works_out ? `${(user.workout_type as string) || 'general training'} on ${workoutDays.join(', ') || 'unspecified days'}${(user.workout_time as string) ? ` at ${user.workout_time}` : ''}` : 'does not work out'}
- Workout days get ${workoutDayKcal} kcal, rest days ${targetKcal} kcal
- Pantry items available: ${pantrySummary}

DAILY MACRO TARGETS:
- Calories: ${targetKcal} kcal (${workoutDayKcal} on workout days)
- Protein: ${user.target_protein_g}g
- Carbs: ${user.target_carbs_g}g
- Fat: ${user.target_fat_g}g

PER-SLOT CALORIE BUDGET (this is the most important requirement — hit these numbers):
Rest days (total ${targetKcal} kcal):
${restBudget}
Workout days (total ${workoutDayKcal} kcal):
${workoutBudget}
Size every meal's portions so its kcal lands within 15% of its slot budget above. Bigger budget means bigger portions: more rice/roti, larger protein servings, add nuts/ghee/paneer for calorie-dense days. The seven slot kcal values for a day MUST sum to within 5% of that day's total (${targetKcal} rest / ${workoutDayKcal} workout). A plan that comes in under target is wrong — scale portions up until it hits.

MEAL SLOT TIMES (based on wake time ${wakeTime}):
- early_morning: ${mealTimes.early_morning}
- breakfast: ${mealTimes.breakfast}
- mid_morning: ${mealTimes.mid_morning}
- lunch: ${mealTimes.lunch}
- evening_snack: ${mealTimes.evening_snack}
- dinner: ${mealTimes.dinner}
- pre_bed: ${mealTimes.pre_bed}

INSTRUCTIONS:
1. Name SPECIFIC real dishes — not generic like "protein + carb". Write actual Indian dish names: "Moong dal chilla with mint chutney", "2 whole wheat roti + rajma curry + cucumber raita", "Grilled chicken tikka with dal fry and brown rice".
2. Use the user's preferred cuisines and everyday food description as the base. If they eat North Indian food, use dal-roti-sabzi. If South Indian, use idli-sambar-rasam. If mixed, vary across the week. Their everyday food description tells you what they actually eat — build around it.
3. Every meal must have specific quantities: "2 rotis", "1 cup dal", "100g chicken", "1 medium banana".
4. Scale calories correctly: workout days get ${workoutDayKcal} kcal (extra carbs before/after workout), rest days get ${targetKcal} kcal.${user.works_out && user.workout_time ? `\n   On workout days (${workoutDays.join(', ')}), the user trains at ${user.workout_time}. Place a carb-forward snack 45-60 min BEFORE the workout and a protein-rich meal within 60 min AFTER it. Adjust the nearest meal slots accordingly.` : ''}
5. VARIETY IS MANDATORY: never repeat the same dish twice in the same slot across the whole week. Use at least 5 distinct breakfasts, 6 distinct lunches, and 6 distinct dinners across the 7 days.
6. Respect ALL dietary restrictions strictly.
7. Keep within the ₹${user.budget_weekly || 2000}/week grocery budget — use seasonal, affordable ingredients.
8. Include early_morning (light, e.g., warm water + soaked almonds) and pre_bed (light, e.g., warm milk or nuts) slots.
9. Every slot must include ingredients as structured objects with name, qty, unit, and category so pantry inventory can be updated after the user confirms a meal.
10. USE THE EXACT MEAL SLOT TIMES GIVEN ABOVE. They are derived from this user's actual wake time (${wakeTime}) and sleep time (${sleepTime}). Do not shift meals to generic times like 07:00 if the user wakes later.
11. This plan must feel hand-made for this person: their goal, their cuisines, their schedule, their budget. Two users with different profiles must never receive the same plan.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no commentary:
{
  "days": [
    {
      "day_index": 0,
      "day_name": "Sunday",
      "is_workout_day": false,
      "total_kcal": ${targetKcal},
      "slots": [
        {
          "slot": "early_morning",
          "time": "${mealTimes.early_morning}",
          "meal": "Warm water with soaked almonds (6) and raisins (10)",
          "kcal": 80,
          "protein_g": 2,
          "carbs_g": 8,
          "fat_g": 5,
          "prep_time_min": 0,
          "ingredients": [
            { "name": "almonds", "qty": 6, "unit": "pieces", "category": "Nuts & Seeds" },
            { "name": "raisins", "qty": 10, "unit": "pieces", "category": "Nuts & Seeds" },
            { "name": "water", "qty": 250, "unit": "ml", "category": "Other" }
          ]
        }
      ]
    }
  ]
}

Generate all 7 days (day_index 0=Sunday through 6=Saturday). Each day must have all 7 slots. Return only the JSON object.`;
}

function applyReplacements(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

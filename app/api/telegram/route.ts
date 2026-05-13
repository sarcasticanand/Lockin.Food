import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { buildSystemPrompt, getFeatureFlags, getInstamartConfig } from '@/lib/prompt-builder';
import { getChatModel } from '@/lib/gemini';
import { sendMessage, sendButtons, sendTyping, answerCallbackQuery } from '@/lib/telegram-helpers';

// ============================================================
// DB HELPERS
// ============================================================
async function getUser(chatId: number) {
  const { data } = await getServerClient()
    .from('users')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single();
  return data;
}

async function getActivePlan(userId: string) {
  const { data } = await getServerClient()
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getPantry(userId: string) {
  const { data } = await getServerClient()
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId);
  return data || [];
}

async function getTodayLog(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await getServerClient()
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', today)
    .single();
  return data;
}

// ============================================================
// CONVERSATIONAL ONBOARDING STEP MACHINE
// ============================================================
type ObStep = {
  key: string;
  q: string;
  type: 'buttons' | 'number';
  options?: [string, string][]; // [label, value]
};

const OB_STEPS: ObStep[] = [
  {
    key: 'goal',
    q: "What's your main goal? 🎯",
    type: 'buttons',
    options: [
      ['Lose fat 🔥', 'lose_fat'],
      ['Gain muscle 💪', 'gain_muscle'],
      ['Clean eating 🥗', 'clean_eating'],
      ['Manage condition 🩺', 'manage_condition'],
    ],
  },
  { key: 'weight_kg', q: 'Current weight in kg? (just the number, e.g. 72)', type: 'number' },
  { key: 'height_cm', q: 'Height in cm? (e.g. 175)', type: 'number' },
  { key: 'age', q: 'Your age?', type: 'number' },
  {
    key: 'sex',
    q: 'Biological sex?',
    type: 'buttons',
    options: [['Male', 'male'], ['Female', 'female']],
  },
  {
    key: 'okay_with_dairy',
    q: 'Okay with dairy? 🥛',
    type: 'buttons',
    options: [['Yes ✓', 'true'], ['No ✗', 'false']],
  },
  {
    key: 'okay_with_eggs',
    q: 'Okay with eggs? 🥚',
    type: 'buttons',
    options: [['Yes ✓', 'true'], ['No ✗', 'false']],
  },
  {
    key: 'okay_with_meat_fish',
    q: 'Okay with meat/fish? 🍗',
    type: 'buttons',
    options: [['Yes ✓', 'true'], ['No ✗', 'false']],
  },
  {
    key: 'works_out',
    q: 'Do you work out? 💪',
    type: 'buttons',
    options: [['Yes 💪', 'true'], ['Sometimes', 'sometimes'], ['No', 'false']],
  },
  {
    key: 'activity_level',
    q: 'How active is your daily lifestyle? 🏃',
    type: 'buttons',
    options: [
      ['Desk job / sedentary', 'sedentary'],
      ['Some walking daily', 'light'],
      ['Physically active job', 'moderate'],
      ['Very active', 'very_active'],
    ],
  },
  {
    key: 'region',
    q: 'What kind of food do you prefer? 🍽️',
    type: 'buttons',
    options: [
      ['North Indian', 'North Indian'],
      ['South Indian', 'South Indian'],
      ['Bengali', 'Bengali'],
      ['Mix of everything', 'Mixed'],
    ],
  },
  {
    key: 'max_cooking_time',
    q: 'How much time for cooking daily? 🍳',
    type: 'buttons',
    options: [
      ['Zero (no cooking)', 'zero'],
      ['Quick < 20 min', 'quick'],
      ['30-45 min', 'medium'],
      ['1hr+ (love it)', 'long'],
    ],
  },
];

function safeStep(onboarding_state: unknown): number {
  if (!onboarding_state || typeof onboarding_state !== 'object') return 0;
  const s = (onboarding_state as Record<string, unknown>).step;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, OB_STEPS.length) : 0;
}

function safeData(onboarding_state: unknown): Record<string, unknown> {
  if (!onboarding_state || typeof onboarding_state !== 'object') return {};
  const d = (onboarding_state as Record<string, unknown>).data;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}

function computeMacros(data: Record<string, unknown>) {
  const weight = Number(data.weight_kg) || 70;
  const height = Number(data.height_cm) || 170;
  const age = Number(data.age) || 25;
  const sex = (data.sex as string) || 'male';
  const activityMap: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725,
  };
  const multiplier = activityMap[(data.activity_level as string)] || 1.375;

  const bmr = sex === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;

  const tdee = Math.round(bmr * multiplier);
  let target_kcal = tdee;
  if (data.goal === 'lose_fat') target_kcal = Math.max(1200, tdee - 400);
  if (data.goal === 'gain_muscle') target_kcal = tdee + 300;

  const target_protein_g = Math.round(weight * (data.goal === 'gain_muscle' ? 2.2 : 1.8));
  const target_fat_g = Math.round((target_kcal * 0.25) / 9);
  const target_carbs_g = Math.round((target_kcal - target_protein_g * 4 - target_fat_g * 9) / 4);

  return { target_kcal, target_protein_g, target_carbs_g, target_fat_g };
}

async function sendOnboardingQuestion(chatId: number, stepDef: ObStep): Promise<void> {
  if (stepDef.type === 'buttons' && stepDef.options) {
    const rows: { text: string; callback_data: string }[][] = [];
    for (let i = 0; i < stepDef.options.length; i += 2) {
      rows.push(
        stepDef.options.slice(i, i + 2).map(([label, value]) => ({
          text: label,
          callback_data: `ob:${value}`,
        }))
      );
    }
    await sendButtons(chatId, stepDef.q, rows);
  } else {
    await sendMessage(chatId, stepDef.q);
  }
}

async function finalizeOnboarding(chatId: number, data: Record<string, unknown>): Promise<void> {
  const db = getServerClient();
  const macros = computeMacros(data);
  const worksOut = data.works_out === 'true' || data.works_out === true || data.works_out === 'sometimes';

  const { error } = await db.from('users').update({
    goal: data.goal,
    weight_kg: data.weight_kg,
    height_cm: data.height_cm,
    age: data.age,
    sex: data.sex,
    okay_with_dairy: data.okay_with_dairy === 'true' || data.okay_with_dairy === true,
    okay_with_eggs: data.okay_with_eggs === 'true' || data.okay_with_eggs === true,
    okay_with_meat_fish: data.okay_with_meat_fish === 'true' || data.okay_with_meat_fish === true,
    works_out: worksOut,
    activity_level: data.activity_level,
    region: data.region,
    max_cooking_time: data.max_cooking_time,
    ...macros,
    onboarding_complete: true,
    onboarding_state: { step: OB_STEPS.length, data },
  }).eq('telegram_chat_id', chatId);

  if (error) console.error('[finalize] DB update error:', error);

  await sendMessage(
    chatId,
    `🎉 *Profile set up!*\n\n` +
    `Daily target: *${macros.target_kcal} kcal*\n` +
    `Protein: *${macros.target_protein_g}g* | Carbs: *${macros.target_carbs_g}g* | Fat: *${macros.target_fat_g}g*\n\n` +
    `Generating your 7-day meal plan... give me 30 seconds ⏳`
  );

  const { data: updatedUser } = await db.from('users').select('id').eq('telegram_chat_id', chatId).single();
  if (updatedUser) {
    try {
      const res = await fetch(`${process.env.APP_URL}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: updatedUser.id }),
      });
      if (res.ok) {
        await sendMessage(chatId, `✅ Your meal plan is ready!\n\nSend */plan* to see today's meals.`);
      } else {
        await sendMessage(chatId, `Send */plan* in a minute — your plan is being prepared.`);
      }
    } catch {
      await sendMessage(chatId, `Send */plan* in a minute — your plan is being prepared.`);
    }
  }
}

// Called only when user exists and onboarding is incomplete.
// input is the raw messageText (callback data like "ob:lose_fat" or typed text like "72").
async function handleOnboardingStep(chatId: number, user: Record<string, unknown>, input: string): Promise<void> {
  const db = getServerClient();
  const step = safeStep(user.onboarding_state);
  const data = { ...safeData(user.onboarding_state) };

  console.log(`[ob] chatId=${chatId} step=${step} input=${input}`);

  const currentDef = OB_STEPS[step];
  if (!currentDef) {
    // Past the last step — finalize
    await finalizeOnboarding(chatId, data);
    return;
  }

  // Strip ob: prefix from inline button callbacks
  const value = input.startsWith('ob:') ? input.slice(3) : input.trim();

  // Validate and parse
  let parsed: unknown = value;
  if (currentDef.type === 'number') {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) {
      await sendMessage(chatId, `Please send a valid number.\n\n${currentDef.q}`);
      return;
    }
    parsed = num;
  } else if (currentDef.type === 'buttons' && currentDef.options) {
    const validValues = currentDef.options.map(([, v]) => v);
    if (!validValues.includes(value)) {
      // Re-send the question — they may have clicked an old button
      await sendOnboardingQuestion(chatId, currentDef);
      return;
    }
  }

  // Convert string booleans
  if (parsed === 'true') parsed = true;
  if (parsed === 'false') parsed = false;

  data[currentDef.key] = parsed;
  const nextStep = step + 1;

  if (nextStep >= OB_STEPS.length) {
    await finalizeOnboarding(chatId, data);
    return;
  }

  // Persist the new step BEFORE sending the next question
  const { error } = await db.from('users')
    .update({ onboarding_state: { step: nextStep, data } })
    .eq('telegram_chat_id', chatId);

  if (error) {
    console.error(`[ob] state update failed at step ${step}:`, error);
    await sendMessage(chatId, `Something went wrong saving your answer. Please try again.`);
    return;
  }

  await sendOnboardingQuestion(chatId, OB_STEPS[nextStep]);
}

// ============================================================
// WEBHOOK HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  const db = getServerClient();
  try {
    const body = await req.json();

    if (!body.message && !body.callback_query) {
      return NextResponse.json({ ok: true });
    }

    const chatId: number = body.message?.chat?.id ?? body.callback_query?.message?.chat?.id;
    const messageText: string = body.message?.text ?? body.callback_query?.data ?? '';
    const callbackQueryId: string | null = body.callback_query?.id ?? null;
    const username: string =
      body.message?.from?.username ??
      body.message?.from?.first_name ??
      body.callback_query?.from?.username ??
      body.callback_query?.from?.first_name ??
      '';

    if (!chatId) return NextResponse.json({ ok: true });

    // Always dismiss the loading spinner on inline buttons immediately
    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId);
    }

    // ---- /start ----
    if (messageText === '/start') {
      let user = await getUser(chatId);

      if (user?.onboarding_complete) {
        await sendMessage(
          chatId,
          `Welcome back ${username || 'there'}! Day ${(user.current_streak || 0) + 1}. You're locked in. 🔒\n\nSend /plan for today's meals.`
        );
        return NextResponse.json({ ok: true });
      }

      // New user or incomplete — upsert so we never fail on unique constraint
      const { error: upsertError } = await db.from('users').upsert(
        {
          telegram_chat_id: chatId,
          telegram_username: username,
          onboarding_state: { step: 0, data: {} },
          onboarding_complete: false,
        },
        { onConflict: 'telegram_chat_id', ignoreDuplicates: false }
      );

      if (upsertError) {
        console.error('[start] upsert error:', upsertError);
        await sendMessage(chatId, `Something went wrong starting your profile. Please try again.`);
        return NextResponse.json({ ok: true });
      }

      user = await getUser(chatId);

      if (!user) {
        console.error('[start] user still null after upsert for chatId:', chatId);
        await sendMessage(chatId, `Something went wrong. Please try again.`);
        return NextResponse.json({ ok: true });
      }

      const step = safeStep(user?.onboarding_state);

      if (step === 0) {
        await sendMessage(
          chatId,
          `Hey ${username || 'there'}! Welcome to *Lockin* 🔒\n\nI'm your AI nutrition coach — meal plans, macro tracking, pantry management, and workout guidance.\n\nLet's set up your profile. 12 quick questions. ⚡`
        );
      } else {
        await sendMessage(chatId, `Welcome back! Resuming from question ${step + 1} of ${OB_STEPS.length}.`);
      }

      await sendOnboardingQuestion(chatId, OB_STEPS[step]);
      return NextResponse.json({ ok: true });
    }

    // ---- /deletedata ----
    if (messageText === '/deletedata') {
      await sendMessage(
        chatId,
        `This will permanently delete your profile, meal plans, pantry, and all history.\n\nType *DELETE* to confirm.`
      );
      return NextResponse.json({ ok: true });
    }

    // ---- DELETE confirmation ----
    if (messageText === 'DELETE') {
      const user = await getUser(chatId);
      if (user) {
        await db.from('shopping_lists').delete().eq('user_id', user.id);
        await db.from('pantry_items').delete().eq('user_id', user.id);
        await db.from('daily_logs').delete().eq('user_id', user.id);
        await db.from('meal_plans').delete().eq('user_id', user.id);
        await db.from('users').delete().eq('id', user.id);
      }
      await sendMessage(chatId, `All your data has been deleted. Send /start to begin again.`);
      return NextResponse.json({ ok: true });
    }

    // ---- Route to onboarding if not complete ----
    const user = await getUser(chatId);

    if (!user) {
      await sendMessage(chatId, `Send /start to begin.`);
      return NextResponse.json({ ok: true });
    }

    if (!user.onboarding_complete) {
      await handleOnboardingStep(chatId, user, messageText);
      return NextResponse.json({ ok: true });
    }

    // ---- Completed onboarding: route through Gemini ----
    await sendTyping(chatId);

    const [plan, pantry, todayLog, features] = await Promise.all([
      getActivePlan(user.id),
      getPantry(user.id),
      getTodayLog(user.id),
      getFeatureFlags(),
    ]);

    const systemPrompt = await buildSystemPrompt(user, plan, pantry, todayLog);
    void features;

    const instamartConfig = await getInstamartConfig();
    let additionalContext = '';
    if (instamartConfig.enabled && messageText.toLowerCase().includes('order')) {
      additionalContext =
        `\n\nINSTAMART INTEGRATION IS ACTIVE. When the user wants to order groceries, you can offer to build their Instamart cart. ${instamartConfig.attribution_text}.`;
    }

    const model = getChatModel(systemPrompt + additionalContext);
    const result = await model.generateContent(messageText);
    const response = result.response.text();

    await sendMessage(chatId, response);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[telegram webhook] error:', error);
    return NextResponse.json({ ok: true });
  }
}

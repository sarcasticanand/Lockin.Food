import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { buildSystemPrompt, getFeatureFlags, getInstamartConfig } from '@/lib/prompt-builder';
import { getChatModel } from '@/lib/gemini';
import { sendMessage, sendTyping, answerCallbackQuery } from '@/lib/telegram-helpers';

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
// TODAY'S PLAN FORMATTER
// ============================================================
const SLOT_LABELS: Record<string, string> = {
  early_morning: '🌅 Early Morning',
  breakfast: '🍳 Breakfast',
  mid_morning: '🍎 Mid-Morning',
  lunch: '🍱 Lunch',
  evening_snack: '☕ Evening Snack',
  dinner: '🌙 Dinner',
  pre_bed: '🌛 Pre-Bed',
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function sendTodayPlan(chatId: number, plan: Record<string, unknown>, user: Record<string, unknown>) {
  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = DAY_NAMES[dayIndex];
  const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const workoutDays = (user.workout_days as string[]) || [];
  const isWorkoutDay = workoutDays.includes(dayName);
  const targetKcal = (user.target_kcal as number) || 2000;
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined;
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;

  if (!todayPlan) {
    await sendMessage(chatId, `No plan found for ${dayLabel}. Your plan may still be generating — try /plan in a minute.`);
    return;
  }

  const slots = (todayPlan.slots || todayPlan.meals) as Record<string, unknown>[] | undefined;
  if (!slots || slots.length === 0) {
    await sendMessage(chatId, `Today's plan looks empty. Send /plan again to retry.`);
    return;
  }

  let msg = `*📅 ${dayLabel}${isWorkoutDay ? ' 💪 Workout Day' : ''}*\n`;
  msg += `Target: *${dayKcal} kcal* · Protein: *${user.target_protein_g || '—'}g*\n\n`;

  let totalKcal = 0;
  for (const slot of slots) {
    const slotKey = (slot.slot || slot.name || '') as string;
    const label = SLOT_LABELS[slotKey] || `🍽️ ${slotKey.replace(/_/g, ' ')}`;
    const meal = (slot.meal || slot.description || slot.food || '') as string;
    const kcal = Number(slot.kcal || slot.calories || 0);
    const protein = Number(slot.protein_g || slot.protein || 0);
    totalKcal += kcal;

    msg += `*${label}*\n${meal}`;
    if (kcal > 0 || protein > 0) msg += ` _(${kcal} kcal · ${protein}g P)_`;
    msg += '\n\n';
  }

  msg += `📊 Total: ~${totalKcal} kcal\n\n`;
  msg += `💬 _Tap to ask: swap a meal, log what you ate, get a recipe_`;

  await sendMessage(chatId, msg);
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

    if (callbackQueryId) await answerCallbackQuery(callbackQueryId);

    // ---- /start ----
    if (messageText === '/start') {
      const user = await getUser(chatId);
      if (!user) {
        const { error } = await db.from('users').insert({
          telegram_chat_id: chatId,
          telegram_username: username,
        });
        if (error) console.error('[start] insert error:', error.message);
      }

      const updatedUser = await getUser(chatId);
      if (updatedUser?.onboarding_complete) {
        await sendMessage(
          chatId,
          `Welcome back ${username || 'there'}! 🔒\n\nSend /plan to see today's meals.`
        );
      } else {
        await sendMessage(
          chatId,
          `Hey ${username || 'there'}! Welcome to *Lockin* 🔒\n\n` +
          `I'm your AI nutrition coach.\n\n` +
          `Set up your profile here (takes 5 minutes):\n` +
          `👉 ${process.env.APP_URL}/onboarding?tg=${chatId}\n\n` +
          `Come back and send /plan once you're done.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ---- /deletedata ----
    if (messageText === '/deletedata') {
      await sendMessage(chatId, `This will permanently delete your profile, meal plans, pantry, and all history.\n\nType *DELETE* to confirm.`);
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

    // ---- Guard: require completed onboarding ----
    const user = await getUser(chatId);
    if (!user || !user.onboarding_complete) {
      const link = `${process.env.APP_URL}/onboarding?tg=${chatId}`;
      await sendMessage(chatId, `Complete your profile first:\n👉 ${link}`);
      return NextResponse.json({ ok: true });
    }

    // ---- /plan — fetch and format today's meals directly ----
    if (messageText === '/plan') {
      let plan = await getActivePlan(user.id);

      if (!plan) {
        await sendMessage(chatId, `No meal plan yet — generating one now... ⏳ give me 30 seconds`);
        try {
          const res = await fetch(`${process.env.APP_URL}/api/generate-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
          if (res.ok) {
            plan = await getActivePlan(user.id);
          }
        } catch (e) {
          console.error('[plan] generate error:', e);
        }
      }

      if (!plan) {
        await sendMessage(chatId, `Plan generation failed. Try /plan again.`);
        return NextResponse.json({ ok: true });
      }

      await sendTodayPlan(chatId, plan, user);
      return NextResponse.json({ ok: true });
    }

    // ---- All other messages → Gemini ----
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
      additionalContext = `\n\nINSTAMART INTEGRATION IS ACTIVE. When the user wants to order groceries, you can offer to build their Instamart cart. ${instamartConfig.attribution_text}.`;
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

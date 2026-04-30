import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { buildSystemPrompt, getFeatureFlags, getInstamartConfig } from '@/lib/prompt-builder';
import { getChatModel } from '@/lib/gemini';
import { sendMessage, sendTyping } from '@/lib/telegram-helpers';

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
// WEBHOOK HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  const db = getServerClient();
  try {
    const body = await req.json();

    if (!body.message && !body.callback_query) {
      return NextResponse.json({ ok: true });
    }

    const chatId: number = body.message?.chat?.id || body.callback_query?.message?.chat?.id;
    const messageText: string = body.message?.text || body.callback_query?.data || '';
    const username: string =
      body.message?.from?.username ||
      body.message?.from?.first_name ||
      '';

    if (!chatId) return NextResponse.json({ ok: true });

    // ---- /start ----
    if (messageText === '/start') {
      const user = await getUser(chatId);
      if (!user) {
        await db.from('users').insert({
          telegram_chat_id: chatId,
          telegram_username: username,
        });
      }
      if (!user || !user.onboarding_complete) {
        await sendMessage(
          chatId,
          `Hey ${username || 'there'}! Welcome to *Lockin* 🔒\n\n` +
          `I'm your AI nutrition coach. I plan your meals, track your macros, manage your pantry, and plan your workouts.\n\n` +
          `Set up your profile here:\n👉 ${process.env.APP_URL}/onboarding?tg=${chatId}\n\n` +
          `Come back and send /plan when you're done.`
        );
      } else {
        await sendMessage(
          chatId,
          `Welcome back ${username || 'there'}! Day ${(user.current_streak || 0) + 1}. You're locked in. 🔒\n\nSend /plan for today's meals.`
        );
      }
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

    // ---- All other messages: route through Gemini ----
    const user = await getUser(chatId);
    if (!user || !user.onboarding_complete) {
      await sendMessage(
        chatId,
        `Set up your profile first:\n👉 ${process.env.APP_URL}/onboarding?tg=${chatId}`
      );
      return NextResponse.json({ ok: true });
    }

    await sendTyping(chatId);

    const [plan, pantry, todayLog, features] = await Promise.all([
      getActivePlan(user.id),
      getPantry(user.id),
      getTodayLog(user.id),
      getFeatureFlags(),
    ]);

    const systemPrompt = await buildSystemPrompt(user, plan, pantry, todayLog);

    // Suppress unused var warning — rate limiting hook point
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

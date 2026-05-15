import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { sendMessage } from '@/lib/telegram-helpers';

// Vercel cron fires this at 1:30 UTC = 7:00 AM IST every day
// Sends today's meal plan to every active user

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SLOT_LABELS: Record<string, string> = {
  early_morning: '🌅 Early Morning',
  breakfast: '🍳 Breakfast',
  mid_morning: '🍎 Mid-Morning',
  lunch: '🍱 Lunch',
  evening_snack: '☕ Evening Snack',
  dinner: '🌙 Dinner',
  pre_bed: '🌛 Pre-Bed',
};

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServerClient();
  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = DAY_NAMES[dayIndex];
  const dayLabel = DAY_LABELS[dayIndex];

  // Get all active users with Telegram chat IDs
  const { data: users, error } = await db
    .from('users')
    .select('id, telegram_chat_id, telegram_username, target_kcal, target_protein_g, workout_days, works_out')
    .eq('onboarding_complete', true)
    .not('telegram_chat_id', 'is', null);

  if (error || !users?.length) {
    console.error('[cron/morning] users fetch error:', error);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let sent = 0;
  for (const user of users) {
    try {
      // Get active plan
      const { data: plan } = await db
        .from('meal_plans')
        .select('plan_data')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!plan) continue;

      const workoutDays = (user.workout_days as string[]) || [];
      const isWorkoutDay = workoutDays.includes(dayName);
      const targetKcal = (user.target_kcal as number) || 2000;
      const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;

      const planData = plan.plan_data as { days?: Record<string, unknown>[] };
      const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;
      const slots = (todayPlan?.slots || todayPlan?.meals) as Record<string, unknown>[] | undefined;

      if (!slots?.length) continue;

      let msg = `☀️ *Good morning! Here's your ${dayLabel} plan${isWorkoutDay ? ' 💪' : ''}*\n`;
      msg += `Target: *${dayKcal} kcal* · Protein: *${user.target_protein_g || '—'}g*\n\n`;

      for (const slot of slots) {
        const slotKey = (slot.slot || slot.name || '') as string;
        const label = SLOT_LABELS[slotKey] || `🍽️ ${slotKey.replace(/_/g, ' ')}`;
        const meal = (slot.meal || slot.description || slot.food || '') as string;
        const kcal = Number(slot.kcal || slot.calories || 0);
        msg += `*${label}*: ${meal}`;
        if (kcal > 0) msg += ` _(${kcal} kcal)_`;
        msg += '\n';
      }

      msg += `\n💬 Reply to swap a meal, log food, or ask anything.`;

      await sendMessage(user.telegram_chat_id as number, msg);
      sent++;
    } catch (e) {
      console.error(`[cron/morning] failed for user ${user.id}:`, e);
    }
  }

  console.log(`[cron/morning] sent to ${sent}/${users.length} users`);
  return NextResponse.json({ ok: true, sent });
}

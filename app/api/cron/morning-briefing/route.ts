import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { sendMessage } from '@/lib/telegram-helpers';

const SLOT_LABELS: Record<string, string> = {
  early_morning: '🌅 Early morning',
  breakfast: '🍳 Breakfast',
  mid_morning: '🍎 Mid-morning',
  lunch: '🍱 Lunch',
  evening_snack: '☕ Snack',
  dinner: '🌙 Dinner',
  pre_bed: '🌛 Pre-bed',
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServerClient();
  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('onboarding_complete', true)
    .not('telegram_chat_id', 'is', null);

  if (!users?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const user of users) {
    try {
      const { data: plan } = await db
        .from('meal_plans')
        .select('plan_data')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!plan) continue;

      const dayIndex = new Date().getDay();
      const dayName = DAY_NAMES[dayIndex];
      const isWorkout = ((user.workout_days as string[]) || []).includes(dayName);
      const targetKcal = (user.target_kcal as number) || 2000;
      const dayKcal = isWorkout ? Math.round(targetKcal * 1.12) : targetKcal;

      type Slot = { slot: string; meal: string; kcal: number; protein_g: number };
      const todayPlan = ((plan.plan_data as { days?: { slots?: Slot[] }[] })?.days)?.[dayIndex];
      if (!todayPlan?.slots?.length) continue;

      const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      let msg = `Good morning! 🔒 *${dayLabel}${isWorkout ? ' 💪' : ''}*\n`;
      msg += `Target: *${dayKcal} kcal* · *${user.target_protein_g || 0}g protein*\n\n`;

      for (const slot of todayPlan.slots) {
        const label = SLOT_LABELS[slot.slot] || slot.slot;
        msg += `${label}: ${slot.meal} _(${slot.kcal} kcal · ${slot.protein_g}g P)_\n`;
      }

      msg += `\n📊 View & log: ${process.env.APP_URL}/dashboard?uid=${user.id}`;
      msg += `\n\n_Reply to swap meals, log food, or ask anything._`;

      await sendMessage(user.telegram_chat_id as number, msg);
      sent++;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`[cron/morning-briefing] user ${user.id}:`, e);
    }
  }

  return NextResponse.json({ sent, total: users.length });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { sendMessage } from '@/lib/telegram-helpers';

// Vercel cron fires this at 14:00 UTC = 7:30 PM IST every day
// Sends an evening check-in nudge to all active users

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServerClient();

  const { data: users, error } = await db
    .from('users')
    .select('id, telegram_chat_id, telegram_username, target_kcal, target_protein_g')
    .eq('onboarding_complete', true)
    .not('telegram_chat_id', 'is', null);

  if (error || !users?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let sent = 0;
  for (const user of users) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: log } = await db
        .from('daily_logs')
        .select('total_kcal, total_protein_g')
        .eq('user_id', user.id)
        .eq('log_date', today)
        .single();

      const loggedKcal = log?.total_kcal || 0;
      const targetKcal = (user.target_kcal as number) || 2000;
      const remaining = targetKcal - loggedKcal;

      let msg = `🌙 *Evening check-in*\n\n`;
      if (loggedKcal > 0) {
        msg += `You've logged *${loggedKcal} kcal* today.\n`;
        if (remaining > 100) {
          msg += `${remaining} kcal left — don't forget dinner and pre-bed snack.\n`;
        } else if (remaining < -100) {
          msg += `You're a bit over today — that's okay, just keep dinner light.\n`;
        } else {
          msg += `You're right on target 🎯\n`;
        }
      } else {
        msg += `Haven't logged anything yet today.\n`;
        msg += `Even a rough log helps — just tell me what you ate.\n`;
      }

      msg += `\n💬 _Reply to log dinner, swap tomorrow's plan, or ask anything._`;

      await sendMessage(user.telegram_chat_id as number, msg);
      sent++;
    } catch (e) {
      console.error(`[cron/evening] failed for user ${user.id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, sent });
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendButtons, pantryAlertButtons } from '@/lib/telegram-helpers'

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// Runs at 6 PM IST (12:30 UTC). Checks pantry and sends low-stock alerts.
export async function GET(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()

  const { data: users } = await db
    .from('users')
    .select('id, telegram_chat_id')
    .eq('telegram_connected', true)
    .eq('onboarding_complete', true)
    .not('telegram_chat_id', 'is', null)

  if (!users?.length) return NextResponse.json({ alerts: 0 })

  let alerts = 0

  for (const user of users) {
    const { data: lowItems } = await db
      .from('pantry_items')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['low', 'out'])

    for (const item of lowItems || []) {
      const text = `${item.name} running low — ${item.quantity || 'limited stock'} left. Add to your next order?`
      await sendButtons(user.telegram_chat_id as number, text, pantryAlertButtons(item.name))
      alerts++
    }
  }

  return NextResponse.json({ alerts })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendButtons, pantryAlertButtons } from '@/lib/telegram-helpers'
import { recomputeDepletion } from '@/lib/pantry-depletion'

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr + 'T12:00:00Z').getTime() - Date.now()
  return Math.round(diff / (24 * 60 * 60 * 1000))
}

// Runs daily. Refreshes depletion projections, then alerts on items that are
// low/out — with a "runs out in N days" note derived from the projection.
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
    // Recompute first so statuses/dates reflect the latest quantities + plan.
    await recomputeDepletion(db, user.id)

    const { data: lowItems } = await db
      .from('pantry_items')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['low', 'out'])

    for (const item of lowItems || []) {
      const days = daysUntil(item.est_depletion_date as string | null)
      const when = item.status === 'out'
        ? 'is out'
        : days !== null && days <= 0
          ? 'runs out today'
          : days !== null
            ? `runs out in ~${days} day${days === 1 ? '' : 's'}`
            : 'is running low'
      const text = `${item.name} ${when}. Add to your next order?`
      await sendButtons(user.telegram_chat_id as number, text, pantryAlertButtons(item.name))
      alerts++
    }
  }

  return NextResponse.json({ alerts })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { generateDailySchedule } from '@/lib/scheduler'
import { addDaysToDateString, istDateString } from '@/lib/time'

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// Runs at midnight IST (18:30 UTC). Generates tomorrow's scheduled messages for all active users.
export async function GET(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()

  const tomorrowStr = addDaysToDateString(istDateString(), 1)

  // Anyone onboarded who has linked a messaging channel. This must include
  // WhatsApp-only users: filtering on telegram_connected alone meant they got
  // a welcome message and then never another scheduled message again.
  const { data: users } = await db
    .from('users')
    .select('*')
    .eq('onboarding_complete', true)
    .or('telegram_connected.eq.true,whatsapp_connected.eq.true')

  if (!users?.length) return NextResponse.json({ scheduled: 0, date: tomorrowStr })

  let scheduled = 0

  for (const user of users) {
    try {
      const { data: plan } = await db
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (!plan) continue

      await generateDailySchedule(user, plan, tomorrowStr)
      scheduled++
    } catch (error) {
      console.error(`[generate-daily-schedule] user ${user.id}:`, error)
    }
  }

  return NextResponse.json({ scheduled, users: users.length, date: tomorrowStr })
}

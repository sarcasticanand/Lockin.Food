import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`
}

// Runs at midnight IST (18:30 UTC). Generates today's scheduled messages for all active users.
export async function GET(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()

  const { data: users } = await db
    .from('users')
    .select('id, name, telegram_chat_id, wake_time, sleep_time, workout_time, workout_days, target_kcal, target_protein_g, current_streak, messaging_mode')
    .eq('telegram_connected', true)
    .eq('onboarding_complete', true)

  if (!users?.length) return NextResponse.json({ scheduled: 0 })

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).toLowerCase()

  let scheduled = 0

  for (const user of users) {
    const wake = (user.wake_time as string) || '07:00'
    const sleep = (user.sleep_time as string) || '23:00'
    const workoutDays = (user.workout_days as string[]) || []
    const isWorkoutDay = workoutDays.includes(dayName)

    // Check active meal plan for today's slot times
    const { data: plan } = await db
      .from('meal_plans')
      .select('plan_data')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    const planDays = (plan?.plan_data as { days?: Array<Record<string,unknown>> })?.days
    const todayPlan = planDays?.[today.getDay()]
    const slots = (todayPlan?.slots as Array<Record<string,unknown>>) || []

    const getSlot = (name: string) => slots.find(s => s.slot === name) as Record<string,unknown> | undefined
    const bf = getSlot('breakfast')
    const ln = getSlot('lunch')
    const dn = getSlot('dinner')

    const bfTime = (bf?.time as string) || addMinutes(wake, 60)
    const lnTime = (ln?.time as string) || addMinutes(wake, 360)
    const dnTime = (dn?.time as string) || addMinutes(wake, 780)
    const dayKcal = isWorkoutDay ? Math.round(((user.target_kcal as number) || 2000) * 1.12) : (user.target_kcal as number) || 2000
    const isMinimal = (user.messaging_mode as string) === 'minimal'

    let messages: Array<{ user_id: string; scheduled_time: string; message_type: string; message_template: string }>

    if (isMinimal) {
      // Minimal mode: morning summary at wake+30 and evening summary at sleep-90
      messages = [
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(wake, 30),
          message_type: 'morning_summary',
          message_template: `☀️ Good morning{{name}}! Here's your plan for today 🔒\n\nTarget: *${dayKcal} kcal · ${user.target_protein_g || 0}g protein*\n\nSend /plan to see all your meals.`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(sleep, -90),
          message_type: 'evening_summary',
          message_template: `🌙 How was your day{{name}}? Streak: {{streak}} days 🔒\n\nTarget: ${dayKcal} kcal · ${user.target_protein_g || 0}g protein\n\nSee your dashboard: ${process.env.APP_URL}/dashboard`,
        },
      ]
    } else {
      // Full mode: all reminders
      messages = [
        {
          user_id: user.id as string,
          scheduled_time: wake,
          message_type: 'wake_check',
          message_template: `Good morning{{name}}! 🔒 Ready to stay locked in today?\n\nTarget: *${dayKcal} kcal · ${user.target_protein_g || 0}g protein*`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(bfTime, -30),
          message_type: 'pre_breakfast',
          message_template: `Breakfast in 30 min: ${(bf?.meal as string) || 'your planned breakfast'} _(${bf?.kcal || 0} kcal · ${bf?.protein_g || 0}g protein)_`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(bfTime, 60),
          message_type: 'post_breakfast',
          message_template: `Did you have the planned breakfast?`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(lnTime, -30),
          message_type: 'pre_lunch',
          message_template: `Lunch coming up: ${(ln?.meal as string) || 'your planned lunch'} _(${ln?.kcal || 0} kcal · ${ln?.protein_g || 0}g protein)_`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(lnTime, 60),
          message_type: 'post_lunch',
          message_template: `Did you have the planned lunch?`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(lnTime, 90),
          message_type: 'hydration_1',
          message_template: `Quick check — have you had at least 5 glasses of water today? 💧`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(dnTime, -30),
          message_type: 'pre_dinner',
          message_template: `Dinner: ${(dn?.meal as string) || 'your planned dinner'} _(${dn?.kcal || 0} kcal · ${dn?.protein_g || 0}g protein)_`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(dnTime, 60),
          message_type: 'post_dinner',
          message_template: `Did you have the planned dinner?`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(dnTime, 90),
          message_type: 'hydration_2',
          message_template: `Evening water check. Target: 8 glasses today. Staying hydrated? 💧`,
        },
        {
          user_id: user.id as string,
          scheduled_time: addMinutes(sleep, -15),
          message_type: 'end_of_day',
          message_template: `Day done. Streak: {{streak}} days 🔒\n\nTarget: ${dayKcal} kcal · ${user.target_protein_g || 0}g protein\n\nSee your dashboard: ${process.env.APP_URL}/dashboard`,
        },
      ]

      if (isWorkoutDay && user.workout_time) {
        messages.push({
          user_id: user.id as string,
          scheduled_time: addMinutes(user.workout_time as string, -60),
          message_type: 'workout_reminder',
          message_template: `Workout in 60 min 💪 Don't forget your pre-workout nutrition.`,
        })
      }
    }

    // Delete today's undelivered messages for this user first
    await db.from('scheduled_messages').delete().eq('user_id', user.id).eq('is_active', true)

    const { error } = await db.from('scheduled_messages').insert(
      messages.map(m => ({ ...m, is_active: true }))
    )
    if (!error) scheduled += messages.length
  }

  return NextResponse.json({ scheduled, users: users.length })
}

import { getServerClient } from '@/lib/supabase'

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`
}

export async function generateDailySchedule(
  user: Record<string, unknown>,
  plan: Record<string, unknown>,
  targetDate?: string
): Promise<void> {
  const db = getServerClient()
  const dateStr = targetDate || new Date().toISOString().split('T')[0]

  const dayIndex = new Date(dateStr + 'T12:00:00Z').getDay()
  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayName = DAY_NAMES[dayIndex]
  const isWorkoutDay = ((user.workout_days as string[]) || []).includes(dayName)

  const planData = plan.plan_data as { days?: Array<Record<string, unknown>> } | undefined
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined
  if (!todayPlan) return

  const slots = (todayPlan.slots as Array<Record<string, unknown>>) || []
  const getSlot = (name: string) => slots.find(s => s.slot === name)

  const firstName = ((user.name as string) || '').split(' ')[0] || 'there'
  const wake = (user.wake_time as string) || '07:00'
  const sleep = (user.sleep_time as string) || '23:00'
  const targetKcal = (user.target_kcal as number) || 2000
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal
  const optOuts = (user.notification_opt_outs as string[]) || []
  // Accept both 'summary' (new) and 'minimal' (legacy) as the low-frequency mode
  const isSummary = ['summary', 'minimal'].includes((user.messaging_mode as string) || '')

  const rows: Array<{
    user_id: string
    scheduled_date: string
    scheduled_time: string
    message_type: string
    message_template: string
    is_active: boolean
  }> = []

  const push = (scheduled_time: string, message_type: string, message_template: string) => {
    if (!optOuts.includes(message_type)) {
      rows.push({ user_id: user.id as string, scheduled_date: dateStr, scheduled_time, message_type, message_template, is_active: true })
    }
  }

  if (!isSummary) {
    const bf = getSlot('breakfast')
    const ln = getSlot('lunch')
    const dn = getSlot('dinner')
    const bfTime = (bf?.time as string) || addMinutes(wake, 60)
    const lnTime = (ln?.time as string) || addMinutes(wake, 300)
    const dnTime = (dn?.time as string) || addMinutes(wake, 720)

    push(wake, 'wake_check',
      `Good morning ${firstName}! Day ${((user.current_streak as number) || 0) + 1}. Ready to stay locked in today? 🔒\n\nTarget: *${dayKcal} kcal · ${user.target_protein_g || 0}g protein*`)

    if (bf) {
      push(addMinutes(bfTime, -30), 'pre_breakfast',
        `Breakfast in 30 min: ${bf.meal as string} _(${bf.kcal || 0} kcal · ${bf.protein_g || 0}g protein)_`)
      push(addMinutes(bfTime, 60), 'post_breakfast',
        `Did you have the planned breakfast?\n*${bf.meal as string}*`)
    }

    if (ln) {
      push(addMinutes(lnTime, -30), 'pre_lunch',
        `Lunch coming up: ${ln.meal as string} _(${ln.kcal || 0} kcal · ${ln.protein_g || 0}g protein)_`)
      push(addMinutes(lnTime, 60), 'post_lunch',
        `Did you have the planned lunch?\n*${ln.meal as string}*`)
    }

    push(addMinutes(lnTime, 90), 'hydration_1',
      `Quick check — have you had at least 5 glasses of water today? 💧`)

    if (isWorkoutDay && user.workout_time) {
      push(addMinutes(user.workout_time as string, -60), 'workout_reminder',
        `Workout in 60 min 💪 Don't forget your pre-workout nutrition.`)
    }

    if (dn) {
      push(addMinutes(dnTime, -30), 'pre_dinner',
        `Dinner tonight: ${dn.meal as string} _(${dn.kcal || 0} kcal · ${dn.protein_g || 0}g protein)_`)
      push(addMinutes(dnTime, 60), 'post_dinner',
        `Did you have the planned dinner?\n*${dn.meal as string}*`)
    }

    push(addMinutes(dnTime, 90), 'hydration_2',
      `Evening water check. Target: 8 glasses today. 💧`)

  } else {
    let briefing = `Good morning ${firstName}! Day ${((user.current_streak as number) || 0) + 1}. 🔒\n\n`
    if (isWorkoutDay) briefing += `💪 Workout day\n\n`
    briefing += `*Today's meals:*\n`

    const EMOJI: Record<string, string> = {
      early_morning: '🌅', breakfast: '🍳', mid_morning: '🍎', lunch: '🍱',
      evening_snack: '☕', dinner: '🌙', pre_bed: '🌛',
    }
    for (const slot of slots) {
      const emoji = EMOJI[slot.slot as string] || '🍽️'
      briefing += `${emoji} ${slot.time}: ${slot.meal}${slot.kcal ? ` _(${slot.kcal} kcal · ${slot.protein_g || 0}g P)_` : ''}\n`
    }
    briefing += `\n📊 *Target:* ${dayKcal} kcal | ${user.target_protein_g || 0}g protein`
    briefing += `\n\nReply anytime to swap a meal or ask anything.`

    push(addMinutes(wake, 30), 'wake_check', briefing)
  }

  push(addMinutes(sleep, -30), 'end_of_day',
    `Day ${((user.current_streak as number) || 0) + 1} done.\n\nHow did it go? Reply with your weight if you weighed in today, or just say "done" to close out the day.`)

  await db.from('scheduled_messages').delete()
    .eq('user_id', user.id)
    .eq('scheduled_date', dateStr)
    .eq('is_active', true)

  if (rows.length > 0) {
    await db.from('scheduled_messages').insert(rows)
  }
}

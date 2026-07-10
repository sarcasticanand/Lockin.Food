import { getServerClient } from '@/lib/supabase'
import { normalizeMealSlots, slotLabel } from '@/lib/meal-slots'
import { istDateString } from '@/lib/time'

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + mins + 24 * 60) % (24 * 60)
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
  const dateStr = targetDate || istDateString()

  const dayIndex = new Date(dateStr + 'T12:00:00Z').getDay()
  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayName = DAY_NAMES[dayIndex]
  const isWorkoutDay = ((user.workout_days as string[]) || []).includes(dayName)

  const planData = plan.plan_data as { days?: Array<Record<string, unknown>> } | undefined
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined
  if (!todayPlan) return

  const slots = normalizeMealSlots(todayPlan.slots)

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
    message_text: string
    is_active: boolean
  }> = []

  const push = (scheduled_time: string, message_type: string, message_text: string) => {
    if (!optOuts.includes(message_type)) {
      rows.push({ user_id: user.id as string, scheduled_date: dateStr, scheduled_time, message_type, message_text, is_active: true })
    }
  }

  // Dispatch runs hourly, so only lateness-tolerant messages are scheduled:
  // a morning briefing, post-meal "did you eat this?" check-ins (which drive
  // logging + pantry inventory), and the end-of-day recap. No pre-meal
  // reminders — they'd arrive too late to be useful.
  if (!isSummary) {
    let briefing = `Good morning ${firstName}! Day ${((user.current_streak as number) || 0) + 1}. Ready to stay locked in today? 🔒\n\n`
    if (isWorkoutDay) briefing += `💪 Workout day${user.workout_time ? ` at ${user.workout_time}` : ''}\n\n`
    briefing += `*Today's meals:*\n`
    for (const slot of slots) {
      briefing += `• ${slot.time} ${slotLabel(slot.slot)}: ${slot.meal}\n`
    }
    briefing += `\n📊 *Target:* ${dayKcal} kcal · ${user.target_protein_g || 0}g protein`
    push(wake, 'wake_check', briefing)

    // Post-meal check-ins only for the main meals (DB constraint allows
    // post_breakfast/lunch/dinner). These drive logging + pantry inventory.
    const CHECK_IN_SLOTS = new Set(['breakfast', 'lunch', 'dinner'])
    for (const slot of slots) {
      if (!slot.time || !CHECK_IN_SLOTS.has(slot.slot)) continue

      const label = slotLabel(slot.slot)
      push(addMinutes(slot.time, 30), `post_${slot.slot}`,
        `Did you have the planned ${label.toLowerCase()}?\n*${slot.meal}*`)
    }

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
    const { error } = await db.from('scheduled_messages').insert(rows)
    if (error) console.error(`[scheduler] insert failed for user ${user.id}:`, error.message)
  }
}

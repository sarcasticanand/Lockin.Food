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
  // a morning briefing, post-meal check-ins (which drive logging + pantry
  // inventory), and the end-of-day recap. No pre-meal reminders, they'd
  // arrive too late to be useful.
  //
  // Copy is written the way a dietician texts: short lines, plain words,
  // no em dashes, no exclamation pileups, at most a stray emoji. Check-in
  // phrasing varies per meal so the day doesn't read like a form letter.
  if (!isSummary) {
    let briefing = `Morning ${firstName}. Day ${((user.current_streak as number) || 0) + 1}.\n`
    if (isWorkoutDay) briefing += `Gym day${user.workout_time ? `, you train at ${user.workout_time}` : ''}. Eat the pre workout snack on time.\n`
    briefing += `\nToday's plan:\n`
    for (const slot of slots) {
      briefing += `${slot.time} ${slotLabel(slot.slot)}: ${slot.meal}\n`
    }
    briefing += `\nAim for ${dayKcal} kcal and ${user.target_protein_g || 0}g protein. Message me here if you want to change anything.`
    push(wake, 'wake_check', briefing)

    // Post-meal check-ins for main meals plus the evening snack. Requires the
    // scheduled_messages message_type check constraint to allow
    // post_evening_snack (see scripts/whatsapp-schema.sql).
    const CHECK_IN_TEXT: Record<string, (meal: string) => string> = {
      breakfast: m => `Done with breakfast? Plan said ${m}. If you had something else, a photo works too.`,
      lunch: m => `How did lunch go? You had ${m} on the plan.`,
      evening_snack: m => `Snack check. ${m} was on the plan for the evening.`,
      dinner: m => `Dinner done? Plan had ${m}.`,
    }
    for (const slot of slots) {
      if (!slot.time || !CHECK_IN_TEXT[slot.slot]) continue
      push(addMinutes(slot.time, 30), `post_${slot.slot}`, CHECK_IN_TEXT[slot.slot](slot.meal))
    }

  } else {
    let briefing = `Morning ${firstName}. Day ${((user.current_streak as number) || 0) + 1}.\n`
    if (isWorkoutDay) briefing += `Gym day today.\n`
    briefing += `\nToday's plan:\n`
    for (const slot of slots) {
      briefing += `${slot.time} ${slotLabel(slot.slot)}: ${slot.meal}${slot.kcal ? ` (${slot.kcal} kcal, ${slot.protein_g || 0}g protein)` : ''}\n`
    }
    briefing += `\nAim for ${dayKcal} kcal and ${user.target_protein_g || 0}g protein. Reply anytime to swap a meal or ask me anything.`

    push(addMinutes(wake, 30), 'wake_check', briefing)
  }

  // The dispatcher replaces this with an accurate macro summary built from
  // daily_logs at send time; this text is only the fallback when nothing
  // was logged all day.
  push(addMinutes(sleep, -30), 'end_of_day',
    `That's the day, ${firstName}. Nothing logged today, so no numbers from me. Send your weight if you weighed in, or just tell me how the day went.`)

  await db.from('scheduled_messages').delete()
    .eq('user_id', user.id)
    .eq('scheduled_date', dateStr)
    .eq('is_active', true)

  if (rows.length > 0) {
    const { error } = await db.from('scheduled_messages').insert(rows)
    if (error) console.error(`[scheduler] insert failed for user ${user.id}:`, error.message)
  }
}

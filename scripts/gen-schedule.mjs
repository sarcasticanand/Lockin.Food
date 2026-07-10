// One-off: backfill today's scheduled_messages for a linked user.
// Standalone (no @/ aliases) so it runs under plain node with .env.local.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const userId = process.argv[2]
if (!userId) { console.error('usage: node gen-schedule.mjs <userId>'); process.exit(1) }

const addMinutes = (time, mins) => {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + mins + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const istDateString = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
const SLOT_LABELS = { early_morning: '🌅 Early Morning', breakfast: '🍳 Breakfast', mid_morning: '🍎 Mid-Morning', lunch: '🍱 Lunch', evening_snack: '☕ Evening Snack', dinner: '🌙 Dinner', pre_bed: '🌛 Pre-Bed' }
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const { data: user } = await db.from('users').select('*').eq('id', userId).single()
const { data: plan } = await db.from('meal_plans').select('*').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
if (!user || !plan) { console.error('missing user or active plan'); process.exit(1) }

const dateStr = istDateString()
const dayIndex = new Date(dateStr + 'T12:00:00Z').getDay()
const dayName = DAY_NAMES[dayIndex]
const isWorkoutDay = (user.workout_days || []).includes(dayName)
const todayPlan = plan.plan_data?.days?.[dayIndex]
if (!todayPlan) { console.error('no plan for day index', dayIndex); process.exit(1) }

// normalize slots (array form)
const slots = (Array.isArray(todayPlan.slots) ? todayPlan.slots : []).map(s => ({
  slot: s.slot, time: s.time, meal: s.meal, kcal: s.kcal || 0, protein_g: s.protein_g || 0,
}))

const firstName = (user.name || '').split(' ')[0] || 'there'
const wake = user.wake_time || '07:00'
const sleep = user.sleep_time || '23:00'
const targetKcal = user.target_kcal || 2000
const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal
const isSummary = ['summary', 'minimal'].includes(user.messaging_mode || '')
const optOuts = user.notification_opt_outs || []
const slotLabel = s => SLOT_LABELS[s] || s

const rows = []
const push = (t, type, tmpl) => { if (!optOuts.includes(type)) rows.push({ user_id: userId, scheduled_date: dateStr, scheduled_time: t, message_type: type, message_text: tmpl, is_active: true }) }

if (!isSummary) {
  let briefing = `Good morning ${firstName}! Day ${(user.current_streak || 0) + 1}. Ready to stay locked in today? 🔒\n\n`
  if (isWorkoutDay) briefing += `💪 Workout day${user.workout_time ? ` at ${user.workout_time}` : ''}\n\n`
  briefing += `*Today's meals:*\n`
  for (const s of slots) briefing += `• ${s.time} ${slotLabel(s.slot)}: ${s.meal}\n`
  briefing += `\n📊 *Target:* ${dayKcal} kcal · ${user.target_protein_g || 0}g protein`
  push(wake, 'wake_check', briefing)
  const CHECK_IN_SLOTS = new Set(['breakfast', 'lunch', 'dinner'])
  for (const s of slots) { if (s.time && CHECK_IN_SLOTS.has(s.slot)) push(addMinutes(s.time, 30), `post_${s.slot}`, `Did you have the planned ${slotLabel(s.slot).toLowerCase()}?\n*${s.meal}*`) }
} else {
  let b = `Good morning ${firstName}! Day ${(user.current_streak || 0) + 1}. 🔒\n\n*Today's meals:*\n`
  for (const s of slots) b += `${s.time}: ${s.meal}\n`
  b += `\n📊 *Target:* ${dayKcal} kcal | ${user.target_protein_g || 0}g protein`
  push(addMinutes(wake, 30), 'wake_check', b)
}
push(addMinutes(sleep, -30), 'end_of_day', `Day ${(user.current_streak || 0) + 1} done.\n\nHow did it go? Reply with your weight if you weighed in, or say "done" to close out the day.`)

await db.from('scheduled_messages').delete().eq('user_id', userId).eq('scheduled_date', dateStr).eq('is_active', true)
const { error } = await db.from('scheduled_messages').insert(rows)
if (error) { console.error('insert failed:', error.message); process.exit(1) }
console.log(`✅ Scheduled ${rows.length} messages for ${dateStr} (wake ${wake}, sleep ${sleep}):`)
for (const r of rows) console.log(`  ${r.scheduled_time}  ${r.message_type}`)

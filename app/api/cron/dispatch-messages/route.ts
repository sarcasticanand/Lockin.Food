import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage, sendButtons, mealConfirmButtons } from '@/lib/telegram-helpers'
import { waSendMessage, waSendButtons } from '@/lib/whatsapp-helpers'
import { sendWinbackEmail } from '@/lib/winback-email'
import { messageSlotFromType } from '@/lib/meal-slots'
import { istDateString } from '@/lib/time'

export const maxDuration = 60

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Free WhatsApp sends require an open 24h customer-service window (anchored
// to the USER's last inbound message; our sends never extend or cost it).
function waWindowOpen(user: Record<string, unknown>): boolean {
  if (!user.whatsapp_connected || !user.whatsapp_phone || !user.whatsapp_last_msg_at) return false
  return Date.now() - new Date(user.whatsapp_last_msg_at as string).getTime() < 24 * 60 * 60 * 1000
}

// The WhatsApp day: morning plan, post-meal check-ins, evening summary.
// Anything else (hydration nudges, workout pings if they ever return) stays
// off WhatsApp; the calendar owns raw reminders there.
function allowedOnWhatsApp(messageType: string): boolean {
  return messageType === 'wake_check' || messageType.startsWith('post_') || messageType === 'end_of_day'
}

// Build the end-of-day summary from what was actually logged today. Only
// numbers we truly track go in it: calories, protein, carbs, fat. No
// invented micronutrients.
async function buildDaySummary(
  db: ReturnType<typeof getServerClient>,
  user: Record<string, unknown>,
  todayStr: string
): Promise<string | null> {
  const { data: log } = await db
    .from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', todayStr).maybeSingle()
  if (!log || (!log.total_kcal && !(log.meals_eaten as unknown[])?.length)) return null

  const firstName = ((user.name as string) || '').split(' ')[0] || 'there'
  const isWorkoutDay = ((user.workout_days as string[]) || []).includes(DAY_NAMES[new Date(todayStr + 'T12:00:00Z').getDay()])
  const targetKcal = (user.target_kcal as number) || 2000
  const dayTarget = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal
  const targetProtein = (user.target_protein_g as number) || 0

  const kcal = (log.total_kcal as number) || 0
  const protein = (log.total_protein_g as number) || 0
  const carbs = (log.total_carbs_g as number) || 0
  const fat = (log.total_fat_g as number) || 0
  const skipped = (log.meals_skipped as string[]) || []

  let text = `Today's numbers, ${firstName}:\n`
  text += `Calories ${kcal} of ${dayTarget}\n`
  text += `Protein ${protein}g of ${targetProtein}g\n`
  text += `Carbs ${carbs}g, fat ${fat}g\n`

  const proteinGap = targetProtein - protein
  const kcalOver = kcal - dayTarget
  if (proteinGap > 25) {
    text += `\nProtein came up short. A bowl of curd or a couple of eggs with breakfast tomorrow covers most of that gap.`
  } else if (kcalOver > 200) {
    text += `\nYou went about ${kcalOver} kcal over today. One day doesn't undo anything, we just keep tomorrow clean.`
  } else if (kcal < dayTarget * 0.6) {
    text += `\nYou ate quite light today. If that was intentional, fine. If meals got skipped, try not to make it a habit, it usually backfires as late night hunger.`
  } else {
    text += `\nSolid day. Nothing to fix.`
  }
  if (skipped.length > 0) text += `\nYou skipped ${skipped.length === 1 ? skipped[0].replace(/_/g, ' ') : `${skipped.length} meals`}.`

  text += `\n\nSend your weight tomorrow morning if you can. Good night.`
  return text
}

// Once a day (first run in the 8am IST hour), nudge users who have gone quiet
// for 3+ days. We email them a prefilled wa.me link rather than sending a paid
// WhatsApp template: the user taps, WhatsApp opens with the message already
// typed, they hit send, and THEIR message opens the free 24-hour window. Total
// WhatsApp cost: zero. Max one nudge per user per 7 days.
async function sendWinbacks(db: ReturnType<typeof getServerClient>, istHour: number): Promise<number> {
  if (istHour !== 8) return 0

  const now = Date.now()
  const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: lapsed } = await db
    .from('users')
    .select('id, name, email, whatsapp_last_msg_at, wa_winback_at')
    .eq('onboarding_complete', true)
    .not('email', 'is', null)
    .or(`whatsapp_last_msg_at.is.null,whatsapp_last_msg_at.lt.${threeDaysAgo}`)

  let sent = 0
  for (const u of lapsed || []) {
    if (!u.email) continue
    if (u.wa_winback_at && u.wa_winback_at > sevenDaysAgo) continue
    const firstName = ((u.name as string) || '').split(' ')[0] || 'there'
    const daysAway = u.whatsapp_last_msg_at
      ? Math.floor((now - new Date(u.whatsapp_last_msg_at as string).getTime()) / 86400000)
      : 3
    const ok = await sendWinbackEmail(u.email as string, firstName, daysAway).catch(() => false)
    if (ok) {
      await db.from('users').update({ wa_winback_at: new Date().toISOString() }).eq('id', u.id)
      sent++
    }
    await new Promise(r => setTimeout(r, 150))
  }
  return sent
}

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// Pinged frequently by an external cron (plus a daily Vercel cron as backup).
// Sends every message that is due (scheduled_time <= now IST) and still unsent.
// A message missed by one run is picked up by the next.
async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()

  const now = new Date()
  const todayStr = istDateString(now)
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const nowHHMM = `${String(istNow.getUTCHours()).padStart(2, '0')}:${String(istNow.getUTCMinutes()).padStart(2, '0')}`

  const { data: messages } = await db
    .from('scheduled_messages')
    .select('*, users(*)')
    .eq('scheduled_date', todayStr)
    .eq('is_active', true)
    .lte('scheduled_time', nowHHMM)
    .order('scheduled_time', { ascending: true })

  let sent = 0

  // How late a message may still be sent. Messages queue up while a
  // WhatsApp user's 24h window is shut, so without this a morning briefing
  // could land at night the moment they reply. Late ones are retired instead.
  const STALE_AFTER_MIN = 150

  for (const msg of messages || []) {
    const user = msg.users as Record<string, unknown>
    const chatId = user?.telegram_chat_id as number
    const messageType = msg.message_type as string

    const [sh, sm] = String(msg.scheduled_time).split(':').map(Number)
    const nowMin = istNow.getUTCHours() * 60 + istNow.getUTCMinutes()
    if (nowMin - (sh * 60 + sm) > STALE_AFTER_MIN) {
      await db.from('scheduled_messages').update({ is_active: false }).eq('id', msg.id)
      continue
    }
    // WhatsApp is preferred when the free window is open and the type belongs
    // there; Telegram is the fallback. One channel per message, never both.
    const viaWhatsApp = waWindowOpen(user) && allowedOnWhatsApp(messageType)
    if (!chatId && !viaWhatsApp) {
      // WhatsApp-only user. Types that never belong on WhatsApp are retired;
      // allowed types with a closed window stay pending — the window may
      // reopen when the user messages later today (dispatch runs hourly).
      if (user?.whatsapp_connected && !allowedOnWhatsApp(messageType)) {
        await db.from('scheduled_messages').update({ is_active: false }).eq('id', msg.id)
      }
      continue
    }

    let text = (msg.message_text as string)
      .replace('{{name}}', (user.name as string) || 'there')
      .replace('{{streak}}', String(user.current_streak || 0))
      .replace('{{target_kcal}}', String(user.target_kcal || 0))
      .replace('{{target_protein_g}}', String(user.target_protein_g || 0))

    // End-of-day recap gets real numbers from today's log; the scheduled
    // text is only the nothing-logged fallback.
    if (messageType === 'end_of_day') {
      const summary = await buildDaySummary(db, user, todayStr).catch(() => null)
      if (summary) text = summary
    }

    try {
      const postMealSlot = messageSlotFromType(messageType)
      const waPhone = user.whatsapp_phone as string

      if (postMealSlot) {
        const buttons = mealConfirmButtons(postMealSlot)
        if (viaWhatsApp) {
          await waSendButtons(waPhone, text, buttons.map(row => row.map(b => ({ text: b.text, data: b.callback_data }))))
        } else {
          await sendButtons(chatId, text, buttons)
        }
      } else {
        if (viaWhatsApp) await waSendMessage(waPhone, text)
        else await sendMessage(chatId, text)
      }

      await db.from('scheduled_messages').update({ is_active: false, sent: true, sent_at: new Date().toISOString() }).eq('id', msg.id)

      await db.from('conversation_history').insert({
        user_id: user.id,
        chat_date: todayStr,
        role: 'assistant',
        content: text,
      })

      sent++
      await new Promise(r => setTimeout(r, 100))
    } catch (error) {
      console.error(`[dispatch-messages] msg ${msg.id}:`, error)
    }
  }

  const winbacks = await sendWinbacks(db, istNow.getUTCHours()).catch(() => 0)

  return NextResponse.json({ sent, winbacks, date: todayStr })
}

export const GET = handler
export const POST = handler

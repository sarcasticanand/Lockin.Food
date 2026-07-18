import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage, sendButtons, mealConfirmButtons } from '@/lib/telegram-helpers'
import { waSendMessage, waSendButtons } from '@/lib/whatsapp-helpers'
import { messageSlotFromType } from '@/lib/meal-slots'
import { istDateString } from '@/lib/time'

// Free WhatsApp sends require an open 24h customer-service window.
function waWindowOpen(user: Record<string, unknown>): boolean {
  if (!user.whatsapp_connected || !user.whatsapp_phone || !user.whatsapp_last_msg_at) return false
  return Date.now() - new Date(user.whatsapp_last_msg_at as string).getTime() < 24 * 60 * 60 * 1000
}

// WhatsApp gets a deliberately quieter cadence than Telegram: only the
// interactive post-meal check-ins and the evening recap. Reminders live in
// the user's calendar there, and the day plan arrives with their first
// message of the day — unprompted pings read as business spam on WhatsApp.
function allowedOnWhatsApp(messageType: string): boolean {
  return messageType.startsWith('post_') || messageType === 'end_of_day'
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

  if (!messages?.length) return NextResponse.json({ sent: 0, date: todayStr })

  let sent = 0

  for (const msg of messages) {
    const user = msg.users as Record<string, unknown>
    const chatId = user?.telegram_chat_id as number
    // Prefer WhatsApp only for message types that belong there; everything
    // else goes to Telegram, or is skipped for WhatsApp-only users.
    const viaWhatsApp = waWindowOpen(user) && allowedOnWhatsApp(msg.message_type as string) && !chatId
    if (!chatId && !viaWhatsApp) {
      // WhatsApp-only user. Types that never belong on WhatsApp are retired;
      // allowed types with a closed window stay pending — the window may
      // reopen when the user messages later today (dispatch runs hourly).
      if (user?.whatsapp_connected && !allowedOnWhatsApp(msg.message_type as string)) {
        await db.from('scheduled_messages').update({ is_active: false }).eq('id', msg.id)
      }
      continue
    }

    const text = (msg.message_text as string)
      .replace('{{name}}', (user.name as string) || 'there')
      .replace('{{streak}}', String(user.current_streak || 0))
      .replace('{{target_kcal}}', String(user.target_kcal || 0))
      .replace('{{target_protein_g}}', String(user.target_protein_g || 0))

    try {
      const postMealSlot = messageSlotFromType(msg.message_type as string)
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

  return NextResponse.json({ sent, date: todayStr })
}

export const GET = handler
export const POST = handler

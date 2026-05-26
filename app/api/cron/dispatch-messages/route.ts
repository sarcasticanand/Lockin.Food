import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage, sendButtons, mealConfirmButtons } from '@/lib/telegram-helpers'

function cronAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// Runs every 5 min. Sends any scheduled_messages due in the current 5-min window.
async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()

  // Current time in IST (UTC+5:30)
  const now = new Date()
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const todayStr = istNow.toISOString().split('T')[0]
  const hh = istNow.getUTCHours()
  const mm = istNow.getUTCMinutes()

  const wsH = hh, wsM = mm
  const weTotal = hh * 60 + mm + 5
  const weH = Math.floor(weTotal / 60) % 24
  const weM = weTotal % 60

  const windowStart = `${wsH.toString().padStart(2, '0')}:${wsM.toString().padStart(2, '0')}`
  const windowEnd = `${weH.toString().padStart(2, '0')}:${weM.toString().padStart(2, '0')}`

  const { data: messages } = await db
    .from('scheduled_messages')
    .select('*, users(id, telegram_chat_id, name, current_streak, target_kcal, target_protein_g)')
    .eq('scheduled_date', todayStr)
    .gte('scheduled_time', windowStart)
    .lt('scheduled_time', windowEnd)
    .eq('is_active', true)

  if (!messages?.length) return NextResponse.json({ sent: 0, window: `${windowStart}-${windowEnd}` })

  let sent = 0

  for (const msg of messages) {
    const user = msg.users as Record<string, unknown>
    const chatId = user?.telegram_chat_id as number
    if (!chatId) continue

    const text = (msg.message_template as string)
      .replace('{{name}}', (user.name as string) || 'there')
      .replace('{{streak}}', String(user.current_streak || 0))
      .replace('{{target_kcal}}', String(user.target_kcal || 0))
      .replace('{{target_protein_g}}', String(user.target_protein_g || 0))

    try {
      const isPostMeal = ['post_breakfast', 'post_lunch', 'post_dinner'].includes(msg.message_type as string)
      const slotMap: Record<string, string> = { post_breakfast: 'breakfast', post_lunch: 'lunch', post_dinner: 'dinner' }

      if (isPostMeal) {
        await sendButtons(chatId, text, mealConfirmButtons(slotMap[msg.message_type as string]))
      } else {
        await sendMessage(chatId, text)
      }

      await db.from('scheduled_messages').update({ is_active: false }).eq('id', msg.id)

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

  return NextResponse.json({ sent, window: `${windowStart}-${windowEnd}` })
}

export const GET = handler
export const POST = handler

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage, sendButtons, mealConfirmButtons } from '@/lib/telegram-helpers'

function cronAuth(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

// Runs every 15 min. Sends any scheduled_messages due in the current window.
async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServerClient()
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(now.getTime() + istOffset)
  const hh = ist.getUTCHours().toString().padStart(2, '0')
  const mm = ist.getUTCMinutes().toString().padStart(2, '0')
  const currentTime = `${hh}:${mm}`

  // Window: current time ±7 min (15-min cron slot)
  const [h, m] = currentTime.split(':').map(Number)
  const windowStart = new Date(0, 0, 0, h, m - 7)
  const windowEnd = new Date(0, 0, 0, h, m + 7)
  const wsStr = `${windowStart.getHours().toString().padStart(2,'0')}:${windowStart.getMinutes().toString().padStart(2,'0')}`
  const weStr = `${windowEnd.getHours().toString().padStart(2,'0')}:${windowEnd.getMinutes().toString().padStart(2,'0')}`

  const { data: messages } = await db
    .from('scheduled_messages')
    .select('*, users(telegram_chat_id, name, target_kcal, target_protein_g, current_streak)')
    .eq('is_active', true)
    .gte('scheduled_time', wsStr)
    .lte('scheduled_time', weStr)

  if (!messages?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const msg of messages) {
    const chatId = (msg.users as Record<string, unknown>)?.telegram_chat_id as number
    if (!chatId) continue

    const user = msg.users as Record<string, unknown>
    const text = msg.message_template
      .replace('{{name}}', (user.name as string) || 'there')
      .replace('{{streak}}', String(user.current_streak || 0))
      .replace('{{target_kcal}}', String(user.target_kcal || 0))
      .replace('{{target_protein_g}}', String(user.target_protein_g || 0))

    const isPostMeal = ['post_breakfast', 'post_lunch', 'post_dinner'].includes(msg.message_type)
    const slotMap: Record<string, string> = { post_breakfast: 'breakfast', post_lunch: 'lunch', post_dinner: 'dinner' }

    if (isPostMeal) {
      await sendButtons(chatId, text, mealConfirmButtons(slotMap[msg.message_type]))
    } else {
      await sendMessage(chatId, text)
    }

    await db.from('scheduled_messages').update({ is_active: false }).eq('id', msg.id)
    sent++
  }

  return NextResponse.json({ sent })
}

export const GET = handler
export const POST = handler

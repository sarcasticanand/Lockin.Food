import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage, sendButtons, sendTyping, answerCallbackQuery } from '@/lib/telegram-helpers'
import { handleBotEvent, sendWelcomeWithPlan, type BotChannel, type BotButton } from '@/lib/bot-engine'

// Thin Telegram webhook: parses Telegram updates, handles Telegram-specific
// account linking (/start deep links, phone matching), then delegates all bot
// behaviour to the shared channel-agnostic engine in lib/bot-engine.ts.

function telegramChannel(chatId: number): BotChannel {
  return {
    channel: 'telegram',
    send: (text: string) => sendMessage(chatId, text),
    sendButtons: (text: string, buttons: BotButton[][]) =>
      sendButtons(chatId, text, buttons.map(row => row.map(b => ({ text: b.text, callback_data: b.data })))),
    typing: () => sendTyping(chatId),
    downloadPhoto: async (fileId: string) => {
      const token = process.env.TELEGRAM_BOT_TOKEN
      const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      const filePath = fileData?.result?.file_path
      if (!filePath) throw new Error('No file_path from Telegram')
      const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
      return { base64: Buffer.from(await imgRes.arrayBuffer()).toString('base64'), mime: 'image/jpeg' }
    },
  }
}

async function getUser(chatId: number) {
  const { data } = await getServerClient()
    .from('users')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const body = await req.json()
    if (!body.message && !body.callback_query) return NextResponse.json({ ok: true })

    const chatId: number = body.message?.chat?.id ?? body.callback_query?.message?.chat?.id
    const messageText: string = (body.message?.text ?? '').trim()
    const callbackData: string = body.callback_query?.data ?? ''
    const callbackQueryId: string | null = body.callback_query?.id ?? null
    const username: string =
      body.message?.from?.username ??
      body.message?.from?.first_name ??
      body.callback_query?.from?.username ??
      body.callback_query?.from?.first_name ??
      ''

    if (!chatId) return NextResponse.json({ ok: true })
    if (callbackQueryId) await answerCallbackQuery(callbackQueryId)

    const ctx = telegramChannel(chatId)

    // ---- Telegram-specific: /start + deep-link account linking ----

    if (messageText.startsWith('/start')) {
      const token = messageText.slice('/start'.length).trim()

      if (token && token.length === 16 && /^[0-9a-f]+$/i.test(token)) {
        const { data: tokenUser } = await db
          .from('users')
          .select('*')
          .eq('link_token', token)
          .gt('link_token_expires_at', new Date().toISOString())
          .single()

        if (tokenUser) {
          await db.from('users').update({
            telegram_chat_id: chatId,
            telegram_username: username,
            telegram_connected: true,
            link_token: null,
            link_token_expires_at: null,
          }).eq('id', tokenUser.id)
          const linkedUser = { ...tokenUser, telegram_chat_id: chatId, telegram_connected: true }
          await sendWelcomeWithPlan(ctx, linkedUser)
          const { data: linkPlan } = await db.from('meal_plans').select('*').eq('user_id', tokenUser.id).eq('is_active', true).limit(1).single()
          if (linkPlan) {
            const { generateDailySchedule } = await import('@/lib/scheduler')
            await generateDailySchedule(linkedUser, linkPlan)
          }
        } else {
          await sendMessage(chatId, `This link has expired. Go to your dashboard and tap "Connect Telegram" for a new link:\n👉 ${process.env.APP_URL}/dashboard`)
        }
        return NextResponse.json({ ok: true })
      }

      const returningUser = await getUser(chatId)
      if (returningUser?.onboarding_complete) {
        const firstName = (returningUser.name as string)?.split(' ')[0] || ''
        const streak = (returningUser.current_streak as number) || 0
        await sendMessage(chatId,
          `Welcome back${firstName ? ` ${firstName}` : ''}! Day ${streak + 1}. 🔒\n\nSend /plan for today's meals.`
        )
        return NextResponse.json({ ok: true })
      }

      if (!returningUser) {
        await db.from('users').insert({ telegram_chat_id: chatId, telegram_username: username })
      }
      await sendMessage(chatId,
        `Hey${username ? ` @${username}` : ''}! 👋\n\n` +
        `Already signed up on *lockin.food*? Reply with your 10-digit phone number and I'll link your account.\n\n` +
        `_New here? Set up your profile first:_\n👉 ${process.env.APP_URL}/onboarding`
      )
      return NextResponse.json({ ok: true })
    }

    // ---- Telegram-specific: phone-number linking for unlinked users ----

    const stateUser = await getUser(chatId)
    const looksLikePhone = (t: string) => { const n = t.replace(/\D/g, '').slice(-10); return n.length === 10 && /^[6-9]/.test(n) }
    if (looksLikePhone(messageText) && (!stateUser || !stateUser.onboarding_complete)) {
      const normalized = messageText.replace(/\D/g, '').slice(-10)
      const { data: phoneUser } = await db.from('users').select('*').ilike('phone_number', `%${normalized}`).limit(1).maybeSingle()

      if (phoneUser) {
        await db.from('users').update({ telegram_chat_id: chatId, telegram_username: username, telegram_connected: true }).eq('id', phoneUser.id)
        if (stateUser && stateUser.id !== phoneUser.id) await db.from('users').delete().eq('id', stateUser.id)
        const linkedUser = { ...phoneUser, telegram_chat_id: chatId, telegram_connected: true }
        await sendWelcomeWithPlan(ctx, linkedUser)
        // Kick off today's message schedule immediately (mirrors the deep-link
        // path) so proactive check-ins start without waiting for the midnight cron.
        const { data: linkPlan } = await db.from('meal_plans').select('*').eq('user_id', phoneUser.id).eq('is_active', true).limit(1).maybeSingle()
        if (linkPlan) {
          const { generateDailySchedule } = await import('@/lib/scheduler')
          await generateDailySchedule(linkedUser, linkPlan)
        }
      } else {
        await sendMessage(chatId, `Couldn't find an account with that number. Make sure you used the same number on *lockin.food*.`)
      }
      return NextResponse.json({ ok: true })
    }

    // ---- Data deletion (kept in-channel for compliance) ----

    if (messageText === '/deletedata') {
      await sendMessage(chatId, `This will permanently delete your profile, meal plans, pantry, and all history.\n\nType *DELETE* to confirm.`)
      return NextResponse.json({ ok: true })
    }

    if (messageText === 'DELETE') {
      const user = await getUser(chatId)
      if (user) {
        await Promise.all([
          db.from('conversation_history').delete().eq('user_id', user.id),
          db.from('scheduled_messages').delete().eq('user_id', user.id),
          db.from('shopping_lists').delete().eq('user_id', user.id),
          db.from('pantry_items').delete().eq('user_id', user.id),
          db.from('daily_logs').delete().eq('user_id', user.id),
          db.from('meal_plans').delete().eq('user_id', user.id),
        ])
        await db.from('users').delete().eq('id', user.id)
      }
      await sendMessage(chatId, `All your data has been deleted. Send /start to begin again.`)
      return NextResponse.json({ ok: true })
    }

    // ---- Everything else → shared engine ----

    const user = stateUser
    if (!user || !user.onboarding_complete) {
      await sendMessage(chatId, `Complete your profile first:\n👉 ${process.env.APP_URL}/onboarding`)
      return NextResponse.json({ ok: true })
    }

    const photos = body.message?.photo as Array<{ file_id: string }> | undefined
    await handleBotEvent(ctx, user, {
      text: messageText,
      callbackData,
      photoId: photos?.length ? photos[photos.length - 1].file_id : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[telegram webhook]', error)
    return NextResponse.json({ ok: true })
  }
}

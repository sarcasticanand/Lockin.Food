import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { whatsappChannel } from '@/lib/whatsapp-helpers'
import { handleBotEvent, sendWelcomeWithPlan } from '@/lib/bot-engine'

export const maxDuration = 60

// WhatsApp Cloud API webhook. Identity comes for free here: every inbound
// message carries the sender's phone number, so users who signed up on
// lockin.food with the same number are linked automatically on first message —
// no /start tokens, no manual linking.

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  if (
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get('hub.challenge') || '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const body = await req.json()
    const value = body?.entry?.[0]?.changes?.[0]?.value
    const msg = value?.messages?.[0]
    // Delivery/read receipts and other notifications — acknowledge and ignore.
    if (!msg) return NextResponse.json({ ok: true })

    // Meta redelivers events on webhook failures; skip anything older than 5 min.
    if (msg.timestamp && Date.now() / 1000 - Number(msg.timestamp) > 300) {
      return NextResponse.json({ ok: true })
    }

    // Dedup: Meta resends the same message id when our response is slow.
    // First insert wins; a genuine duplicate hits the unique-key conflict
    // (Postgres 23505) and we bail so the user never gets a doubled reply.
    // Any other error (e.g. table not migrated yet) fails open — better a
    // rare double than total silence.
    if (msg.id) {
      const { error: dupErr } = await db.from('processed_messages').insert({ wamid: String(msg.id) })
      if (dupErr?.code === '23505') return NextResponse.json({ ok: true })
    }

    // ACK Meta immediately (it enforces a ~5s webhook timeout and throttles or
    // disables endpoints that are consistently slow — Gemini replies take
    // several seconds). The real work runs after the response via after().
    after(async () => {
      try {
        await processMessage(value, msg)
      } catch (e) {
        console.error('[whatsapp after]', e)
      }
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[whatsapp webhook]', error)
    // Always 200 — a non-200 makes Meta retry and eventually disable the webhook.
    return NextResponse.json({ ok: true })
  }
}

async function processMessage(value: Record<string, unknown> | undefined, msg: Record<string, unknown>) {
  const db = getServerClient()
  try {
    const from = String(msg.from) // E.164 without '+', e.g. "919729973400"
    const contacts = (value as { contacts?: Array<{ profile?: { name?: string } }> } | undefined)?.contacts
    const profileName: string = contacts?.[0]?.profile?.name || ''

    const type = String(msg.type)
    // Quick-reply taps on template messages arrive as type "button" with the
    // button's label as text; route them through the normal text path.
    const buttonText = type === 'button' ? String((msg.button as { text?: string })?.text || '').trim() : ''
    const text: string = type === 'text' ? String((msg.text as { body?: string })?.body || '').trim() : buttonText
    const callbackData: string = type === 'interactive' ? String((msg.interactive as { button_reply?: { id?: string } })?.button_reply?.id || '') : ''
    const photoId: string | undefined = type === 'image' ? (msg.image as { id?: string })?.id : undefined

    const ctx = whatsappChannel(from, String(msg.id))

    // Match account by phone number (last 10 digits, same rule as Telegram linking).
    const last10 = from.replace(/\D/g, '').slice(-10)
    const { data: user } = await db
      .from('users')
      .select('*')
      .ilike('phone_number', `%${last10}`)
      .limit(1)
      .maybeSingle()

    if (!user || !user.onboarding_complete) {
      await ctx.send(
        `Hey${profileName ? ` ${profileName}` : ''}! 👋 I'm *Kanshi*, your AI nutrition coach on lockin.food.\n\n` +
        `I don't have a profile for this number yet. Set yours up in ~2 minutes (use this same number):\n👉 ${process.env.APP_URL}/onboarding\n\n` +
        `Once you're done, message me here again and everything starts automatically.`
      )
      return
    }

    // First WhatsApp contact for a known account → link and welcome.
    if (!user.whatsapp_connected) {
      await db.from('users').update({
        whatsapp_connected: true,
        whatsapp_phone: from,
        whatsapp_last_msg_at: new Date().toISOString(),
      }).eq('id', user.id)
      await sendWelcomeWithPlan(ctx, { ...user, whatsapp_connected: true })
      const { data: linkPlan } = await db.from('meal_plans').select('*').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
      if (linkPlan) {
        const { generateDailySchedule } = await import('@/lib/scheduler')
        await generateDailySchedule({ ...user, whatsapp_connected: true }, linkPlan)
      }
      return
    }

    // Track the 24h customer-service window for free proactive messages.
    await db.from('users').update({ whatsapp_last_msg_at: new Date().toISOString() }).eq('id', user.id)

    await handleBotEvent(ctx, user, { text, callbackData, photoId })
  } catch (error) {
    console.error('[whatsapp process]', error)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram-helpers'
import { waSendMessage } from '@/lib/whatsapp-helpers'
import { waLink, WA_PREFILL } from '@/lib/wa-link'
import { Resend } from 'resend'
import crypto from 'crypto'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Cryptographically secure 6-digit code (crypto.randomInt is uniform + unpredictable).
function generateOTP(): string {
  return String(crypto.randomInt(100000, 1000000))
}

// Generic response returned whether or not the number maps to an account, and
// whether or not it has a delivery channel — prevents phone-number enumeration.
const GENERIC_SENT = { sent: true } as const

export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const { phone } = await req.json()
    const digits = (phone as string)?.replace(/\D/g, '').slice(-10)
    if (!digits || digits.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit phone number' }, { status: 400 })
    }

    const { data: user } = await db
      .from('users')
      .select('id, name, telegram_chat_id, email, whatsapp_phone, whatsapp_connected, whatsapp_last_msg_at')
      .ilike('phone_number', `%${digits}`)
      .limit(1)
      .maybeSingle()

    // Do not reveal whether the account exists.
    if (!user) {
      return NextResponse.json(GENERIC_SENT)
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    // Reset the attempt counter each time a fresh code is issued.
    await db.from('users').update({ otp_code: otp, otp_expires_at: expiresAt, otp_attempts: 0 }).eq('id', user.id)

    const body = `🔐 Your lockin.food login code is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`

    // WhatsApp first: it is the product's home, and a code arrives in the same
    // thread the user already talks to. Only possible while their 24h service
    // window is open (a free-form send), so email remains the reliable path.
    const waWindowOpen = Boolean(
      user.whatsapp_connected && user.whatsapp_phone && user.whatsapp_last_msg_at &&
      Date.now() - new Date(user.whatsapp_last_msg_at as string).getTime() < 24 * 60 * 60 * 1000
    )
    if (waWindowOpen) {
      try {
        await waSendMessage(user.whatsapp_phone as string, body)
        return NextResponse.json({ sent: true, method: 'whatsapp', name: user.name })
      } catch { /* fall through to email */ }
    }

    if (user.email && resend) {
      const { error: mailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'lockin.food <onboarding@resend.dev>',
        to: user.email,
        subject: 'Your lockin.food login code',
        html: `<p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 5 minutes. Do not share it with anyone.</p>`,
      })
      // A silent Resend failure (unverified sending domain, sandbox address)
      // used to look like success while the user waited for a code that never
      // arrived. Surface it instead.
      if (mailError) {
        console.error('[login/send-otp] resend failed:', mailError)
        return NextResponse.json({ error: 'We could not send your code by email right now. Message us on WhatsApp and we will get you in.' }, { status: 500 })
      }
      return NextResponse.json({ sent: true, method: 'email', name: user.name })
    }

    if (user.telegram_chat_id) {
      await sendMessage(user.telegram_chat_id, body)
      return NextResponse.json({ sent: true, method: 'telegram', name: user.name })
    }

    // Account exists but has no way to receive a code. Point at WhatsApp,
    // which both links the account and opens the window for future codes.
    return NextResponse.json({
      error: 'No email or WhatsApp linked to this account yet.',
      waLink: waLink(WA_PREFILL.start),
    }, { status: 400 })
  } catch (e) {
    console.error('[login/send-otp]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

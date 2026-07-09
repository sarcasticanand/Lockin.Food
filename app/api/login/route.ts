import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram-helpers'
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
      .select('id, name, telegram_chat_id, email')
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

    if (user.telegram_chat_id) {
      await sendMessage(user.telegram_chat_id, `🔐 Your lockin.food login code is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`)
      return NextResponse.json({ sent: true, method: 'telegram', name: user.name })
    }

    if (user.email && resend) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'lockin.food <onboarding@resend.dev>',
        to: user.email,
        subject: 'Your lockin.food login code',
        html: `<p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 5 minutes. Do not share it with anyone.</p>`,
      })
      return NextResponse.json({ sent: true, method: 'email', name: user.name })
    }

    // Account exists but has no delivery channel. Surface the actionable
    // linking instructions (this only reaches a real, channel-less account).
    return NextResponse.json({
      error: 'No Telegram or email linked to this account. Open @lockinfood_bot on Telegram, send it your registered phone number to link your account, then try logging in again.',
    }, { status: 400 })
  } catch (e) {
    console.error('[login/send-otp]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

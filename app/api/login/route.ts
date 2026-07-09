import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram-helpers'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

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

    if (!user) {
      return NextResponse.json({ error: 'No account found with this number' }, { status: 404 })
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    await db.from('users').update({ otp_code: otp, otp_expires_at: expiresAt }).eq('id', user.id)

    let method: 'telegram' | 'email'

    if (user.telegram_chat_id) {
      await sendMessage(user.telegram_chat_id, `🔐 Your lockin.food login code is: *${otp}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`)
      method = 'telegram'
    } else if (user.email && resend) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'lockin.food <onboarding@resend.dev>',
        to: user.email,
        subject: 'Your lockin.food login code',
        html: `<p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 5 minutes. Do not share it with anyone.</p>`,
      })
      method = 'email'
    } else {
      return NextResponse.json({
        error: 'No Telegram or email linked to this account. Open @lockinfood_bot on Telegram, send it your registered phone number to link your account, then try logging in again.',
      }, { status: 400 })
    }

    return NextResponse.json({ sent: true, method, name: user.name })
  } catch (e) {
    console.error('[login/send-otp]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const { phone, otp } = await req.json()
    const digits = (phone as string)?.replace(/\D/g, '').slice(-10)
    if (!digits || digits.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    if (!otp || String(otp).length !== 6) {
      return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 })
    }

    const MAX_ATTEMPTS = 5

    const { data: user } = await db
      .from('users')
      .select('id, name, otp_code, otp_expires_at, otp_attempts')
      .ilike('phone_number', `%${digits}`)
      .limit(1)
      .maybeSingle()

    // Generic error for both "no account" and "no active code" so verify can't
    // be used to enumerate accounts either.
    if (!user || !user.otp_code) {
      return NextResponse.json({ error: 'Incorrect or expired code. Request a new one.' }, { status: 401 })
    }

    // Expired code — clear it and force a re-request.
    if (user.otp_expires_at && new Date(user.otp_expires_at) < new Date()) {
      await db.from('users').update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 }).eq('id', user.id)
      return NextResponse.json({ error: 'Code expired. Request a new one.' }, { status: 401 })
    }

    // Too many wrong guesses — burn the code so brute force can't continue.
    if ((user.otp_attempts ?? 0) >= MAX_ATTEMPTS) {
      await db.from('users').update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 }).eq('id', user.id)
      return NextResponse.json({ error: 'Too many incorrect attempts. Request a new code.' }, { status: 429 })
    }

    // Wrong code — count the attempt and reject.
    if (user.otp_code !== String(otp)) {
      await db.from('users').update({ otp_attempts: (user.otp_attempts ?? 0) + 1 }).eq('id', user.id)
      return NextResponse.json({ error: 'Incorrect code' }, { status: 401 })
    }

    // Success — consume the code.
    await db.from('users').update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 }).eq('id', user.id)

    return NextResponse.json({ userId: user.id, name: user.name })
  } catch (e) {
    console.error('[login/verify]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

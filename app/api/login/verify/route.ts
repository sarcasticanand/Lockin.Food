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

    const { data: user } = await db
      .from('users')
      .select('id, name, otp_code, otp_expires_at')
      .ilike('phone_number', `%${digits}`)
      .limit(1)
      .maybeSingle()

    if (!user) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 })
    }

    if (!user.otp_code || user.otp_code !== String(otp)) {
      return NextResponse.json({ error: 'Incorrect code' }, { status: 401 })
    }

    if (user.otp_expires_at && new Date(user.otp_expires_at) < new Date()) {
      await db.from('users').update({ otp_code: null, otp_expires_at: null }).eq('id', user.id)
      return NextResponse.json({ error: 'Code expired. Request a new one.' }, { status: 401 })
    }

    await db.from('users').update({ otp_code: null, otp_expires_at: null }).eq('id', user.id)

    return NextResponse.json({ userId: user.id, name: user.name })
  } catch (e) {
    console.error('[login/verify]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

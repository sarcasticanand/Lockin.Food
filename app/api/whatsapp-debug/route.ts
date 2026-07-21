import { NextRequest, NextResponse } from 'next/server'

// TEMPORARY diagnostic endpoint. Gated by CRON_SECRET. Talks to the Meta Graph
// API with the real server-side token and returns the exact responses so we can
// see, without relying on Vercel logs:
//   1. whether env creds are present
//   2. whether an outbound text send succeeds (and the precise error if not)
//   3. whether our app is still subscribed to the WABA's webhooks
// Remove after debugging.

const GRAPH = 'https://graph.facebook.com/v25.0'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  if (p.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const token = process.env.WHATSAPP_TOKEN || ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
  const wabaId = process.env.WHATSAPP_WABA_ID || '3734659183357189'
  const to = p.get('to') || ''

  const result: Record<string, unknown> = {
    env: {
      WHATSAPP_TOKEN_len: token.length,
      WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
      WHATSAPP_WABA_ID: wabaId,
    },
  }

  // 1. Is our app still subscribed to this WABA's webhooks?
  try {
    const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    result.subscribed_apps = { status: subRes.status, body: await subRes.json().catch(() => null) }
  } catch (e) {
    result.subscribed_apps = { error: String(e) }
  }

  // 2. Phone number details (quality rating, verified name, throughput).
  try {
    const pnRes = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,throughput,platform_type,code_verification_status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    result.phone_number = { status: pnRes.status, body: await pnRes.json().catch(() => null) }
  } catch (e) {
    result.phone_number = { error: String(e) }
  }

  // 3. Attempt a real outbound text send (only if `to` given).
  if (to) {
    try {
      const sendRes = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: 'lockin.food diagnostic ping — reply "ok" if you see this.' },
        }),
      })
      result.send = { status: sendRes.status, body: await sendRes.json().catch(() => null) }
    } catch (e) {
      result.send = { error: String(e) }
    }
  }

  return NextResponse.json(result, { status: 200 })
}

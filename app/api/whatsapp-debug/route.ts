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

  // Subscribe our app to this WABA's webhooks (POST). Needed once so inbound
  // messages are delivered to our /api/whatsapp endpoint, not just Meta's
  // built-in test viewer.
  if (p.get('action') === 'subscribe') {
    try {
      const subPost = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      result.subscribe_result = { status: subPost.status, body: await subPost.json().catch(() => null) }
    } catch (e) {
      result.subscribe_result = { error: String(e) }
    }
  }

  // 1. Which apps are subscribed to this WABA's webhooks?
  try {
    const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    result.subscribed_apps = { status: subRes.status, body: await subRes.json().catch(() => null) }
  } catch (e) {
    result.subscribed_apps = { error: String(e) }
  }

  // Send the win-back email on demand (normally only fires at 8am IST for
  // users quiet 3+ days). Verifies the Resend path and the prefilled wa.me
  // link without waiting for the cron.
  if (p.get('action') === 'test_winback') {
    const email = p.get('email') || ''
    const { sendWinbackEmail } = await import('@/lib/winback-email')
    const ok = await sendWinbackEmail(email, p.get('name') || 'there', 3).catch((e) => {
      result.winback_error = String(e)
      return false
    })
    result.winback_sent = ok
  }

  // Remove a specific app's subscription from this WABA. Meta's built-in
  // "WA DevX Webhook Events 1P App" can intercept message webhooks (they show
  // up under "Check test webhooks" instead of hitting our callback URL).
  if (p.get('action') === 'unsubscribe_app') {
    const targetApp = p.get('app_id') || ''
    try {
      const delRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps?app_id=${encodeURIComponent(targetApp)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      result.unsubscribe_result = { app_id: targetApp, status: delRes.status, body: await delRes.json().catch(() => null) }
    } catch (e) {
      result.unsubscribe_result = { error: String(e) }
    }
  }

  // 1b. App-level webhook config: callback URL + which fields are subscribed.
  // Inbound needs the "messages" field subscribed here, not just the WABA link.
  const appId = process.env.WHATSAPP_APP_ID || '1053025110432940'
  try {
    const appSubRes = await fetch(`${GRAPH}/${appId}/subscriptions?access_token=${encodeURIComponent(token)}`)
    result.app_subscriptions = { status: appSubRes.status, body: await appSubRes.json().catch(() => null) }
  } catch (e) {
    result.app_subscriptions = { error: String(e) }
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

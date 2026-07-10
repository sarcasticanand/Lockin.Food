import { NextRequest, NextResponse } from 'next/server'
import { handleCallback } from '@/lib/swiggy-oauth'

// Simple themed HTML result page (this URL opens in the user's browser after
// they finish Swiggy phone+OTP, so it must be human-readable, not JSON).
function page(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? '#2D4A3E' : '#C66B5C'
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#F5F3EE;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:340px;text-align:center;padding:32px">
<div style="font-size:48px;margin-bottom:12px">${ok ? '✅' : '⚠️'}</div>
<h1 style="color:${color};font-size:22px;margin:0 0 8px">${title}</h1>
<p style="color:#6B7268;font-size:15px;line-height:1.5">${message}</p>
<p style="color:#6B7268;font-size:13px;margin-top:24px">You can close this tab and return to Telegram.</p>
</div></body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error) return page('Linking cancelled', `Swiggy returned: ${error}. You can try again from the bot.`, false)
  if (!code || !state) return page('Something went wrong', 'Missing authorization details. Please start again from the bot.', false)

  try {
    await handleCallback(code, state)
    return page('Swiggy connected!', 'Your Swiggy account is linked. Head back to Telegram and ask me to build your grocery cart.', true)
  } catch (e) {
    console.error('[swiggy/callback]', e)
    const msg = e instanceof Error ? e.message : 'Please try again from the bot.'
    return page('Could not link Swiggy', msg, false)
  }
}

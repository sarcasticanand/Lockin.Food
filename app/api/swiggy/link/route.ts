import { NextRequest, NextResponse } from 'next/server'
import { buildAuthUrl } from '@/lib/swiggy-oauth'

// Starts Swiggy account linking for a user. Returns the authorization URL (or
// redirects straight to it when opened in a browser via ?redirect=1).
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('uid')
  if (!userId) return NextResponse.json({ error: 'uid required' }, { status: 400 })

  try {
    const url = await buildAuthUrl(userId)
    if (req.nextUrl.searchParams.get('redirect') === '1') {
      return NextResponse.redirect(url)
    }
    return NextResponse.json({ url })
  } catch (e) {
    console.error('[swiggy/link]', e)
    return NextResponse.json({ error: 'Failed to start Swiggy linking' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { getValidAccessToken, buildAuthUrl } from '@/lib/swiggy-oauth'
import { getAddresses, updateCart } from '@/lib/swiggy'
import { matchShoppingList, type ShoppingItem } from '@/lib/swiggy-match'

export const maxDuration = 120

// Build a Swiggy Instamart cart from the user's latest lockin.food shopping
// list. Never checks out — returns the cart for the user to review and order.
export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const { userId, addressId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const token = await getValidAccessToken(userId)
    if (!token) {
      const linkUrl = await buildAuthUrl(userId)
      return NextResponse.json({ linked: false, linkUrl })
    }

    // Delivery address: use the one passed, else the user's most-recent Swiggy address.
    const addresses = await getAddresses(token)
    if (!addresses.length) {
      return NextResponse.json({ error: 'No Swiggy delivery address found. Add one in the Swiggy app first.' }, { status: 400 })
    }
    const chosen = addressId ? addresses.find((a) => a.id === addressId) : addresses[0]
    if (!chosen) return NextResponse.json({ error: 'That address was not found on your Swiggy account.' }, { status: 400 })

    // Pull the latest shopping list.
    const { data: list } = await db
      .from('shopping_lists')
      .select('items')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const rawItems = (Array.isArray(list?.items) ? list!.items : []) as Array<Record<string, unknown>>
    // Only buy things not already in the pantry.
    const items: ShoppingItem[] = rawItems
      .filter((i) => !i.checked && !i.in_pantry)
      .map((i) => ({ name: String(i.name), qty: i.qty ? Number(i.qty) : undefined, unit: i.unit ? String(i.unit) : undefined }))

    if (!items.length) {
      return NextResponse.json({ error: 'Your shopping list is empty. Generate one from your meal plan first.' }, { status: 400 })
    }

    const match = await matchShoppingList(token, chosen.id, items)
    if (!match.matched.length) {
      return NextResponse.json({ linked: true, address: chosen, ...match, cart: null, error: 'Nothing could be matched on Instamart.' })
    }

    const cart = await updateCart(
      token,
      chosen.id,
      match.matched.map((m) => ({ spinId: m.spinId, skuId: m.skuId, quantity: m.packs }))
    )

    return NextResponse.json({ linked: true, address: chosen, matched: match.matched, skipped: match.skipped, unmatched: match.unmatched, cart })
  } catch (e) {
    console.error('[swiggy/cart]', e)
    return NextResponse.json({ error: 'Failed to build Swiggy cart' }, { status: 500 })
  }
}

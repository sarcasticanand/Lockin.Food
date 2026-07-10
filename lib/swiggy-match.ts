import { searchProducts, type SwiggyVariation } from '@/lib/swiggy'

export interface ShoppingItem {
  name: string
  qty?: number
  unit?: string
}

export interface MatchedItem {
  requested: string
  requestedQty?: number
  requestedUnit?: string
  product: string
  pack: string
  packs: number
  spinId: string
  skuId: string
  price: number
}

export interface MatchResult {
  matched: MatchedItem[]
  skipped: string[]   // staples we intentionally didn't try to buy
  unmatched: string[] // real items with no in-stock Swiggy result
}

// Micro-staples / pantry basics people don't order per meal — skip these so we
// don't spam the cart with "2 pinches salt". Matched by name keyword.
const STAPLE_KEYWORDS = [
  'salt', 'water', 'spice', 'masala', 'turmeric', 'pepper', 'cumin', 'coriander powder',
  'chilli powder', 'garam', 'cardamom', 'nutmeg', 'mustard seed', 'curry leaves', 'bay leaf',
  'asafoetida', 'hing', 'baking', 'food color', 'essence',
]

// Units that indicate a trivial amount we shouldn't shop for.
const TRIVIAL_UNITS = ['pinch', 'pinches', 'tsp', 'tbsp', 'dash']

function isStaple(item: ShoppingItem): boolean {
  const n = item.name.toLowerCase()
  if (TRIVIAL_UNITS.includes((item.unit || '').toLowerCase())) return true
  return STAPLE_KEYWORDS.some((k) => n.includes(k))
}

// Parse a pack description ("200 g x 2", "500 ml", "6 Pieces", "1 ltr") into a
// total amount in a base unit family (g, ml, or pcs) for size comparison.
function parsePack(desc: string): { total: number; family: 'mass' | 'vol' | 'count' } | null {
  const d = desc.toLowerCase()
  const multMatch = d.match(/x\s*(\d+)/)
  const mult = multMatch ? Number(multMatch[1]) : 1
  const numMatch = d.match(/([\d.]+)\s*(kg|g|gram|ml|l|ltr|liter|litre|piece|pieces|pcs|pc)/)
  if (!numMatch) return null
  let val = Number(numMatch[1])
  const unit = numMatch[2]
  let family: 'mass' | 'vol' | 'count'
  if (unit === 'kg') { val *= 1000; family = 'mass' }
  else if (['g', 'gram'].includes(unit)) family = 'mass'
  else if (['l', 'ltr', 'liter', 'litre'].includes(unit)) { val *= 1000; family = 'vol' }
  else if (unit === 'ml') family = 'vol'
  else family = 'count'
  return { total: val * mult, family }
}

function neededBase(item: ShoppingItem): { total: number; family: 'mass' | 'vol' | 'count' } | null {
  if (!item.qty) return null
  const u = (item.unit || '').toLowerCase()
  if (u === 'kg') return { total: item.qty * 1000, family: 'mass' }
  if (['g', 'gram', 'grams'].includes(u)) return { total: item.qty, family: 'mass' }
  if (['l', 'ltr', 'liter', 'litre'].includes(u)) return { total: item.qty * 1000, family: 'vol' }
  if (['ml'].includes(u)) return { total: item.qty, family: 'vol' }
  if (['piece', 'pieces', 'pcs', 'pc', 'medium', 'large', 'small'].includes(u)) return { total: item.qty, family: 'count' }
  return null
}

// Pick the best in-stock variation across the returned products: prefer a pack
// whose size covers the needed amount with the fewest packs, cheapest on ties.
function pickVariation(
  products: Awaited<ReturnType<typeof searchProducts>>,
  need: ReturnType<typeof neededBase>
): { v: SwiggyVariation; packs: number } | null {
  const candidates: Array<{ v: SwiggyVariation; packs: number; waste: number }> = []

  for (const p of products) {
    if (!p.inStock) continue
    for (const v of p.variations) {
      if (!v.isInStockAndAvailable) continue
      const pack = parsePack(v.quantityDescription)
      let packs = 1
      let waste = 0
      if (need && pack && pack.family === need.family && pack.total > 0) {
        packs = Math.max(1, Math.min(6, Math.round(need.total / pack.total)))
        waste = Math.abs(packs * pack.total - need.total)
      } else if (need && pack && pack.family !== need.family) {
        // unit family mismatch — weak match, penalise
        waste = Number.MAX_SAFE_INTEGER / 2
      }
      candidates.push({ v, packs, waste })
    }
  }
  if (!candidates.length) return null

  // Rank: least waste, then cheapest total.
  candidates.sort((a, b) => {
    if (a.waste !== b.waste) return a.waste - b.waste
    return a.v.price.offerPrice * a.packs - b.v.price.offerPrice * b.packs
  })
  const best = candidates[0]
  return { v: best.v, packs: best.packs }
}

// Match a shopping list to Swiggy Instamart SKUs for one delivery address.
export async function matchShoppingList(
  accessToken: string,
  addressId: string,
  items: ShoppingItem[]
): Promise<MatchResult> {
  const matched: MatchedItem[] = []
  const skipped: string[] = []
  const unmatched: string[] = []

  for (const item of items) {
    if (isStaple(item)) { skipped.push(item.name); continue }

    let products
    try {
      products = await searchProducts(accessToken, addressId, item.name)
    } catch {
      unmatched.push(item.name)
      continue
    }

    const need = neededBase(item)
    const pick = pickVariation(products, need)
    if (!pick) { unmatched.push(item.name); continue }

    matched.push({
      requested: item.name,
      requestedQty: item.qty,
      requestedUnit: item.unit,
      product: pick.v.displayName,
      pack: pick.v.quantityDescription,
      packs: pick.packs,
      spinId: pick.v.spinId,
      skuId: pick.v.skuId,
      price: pick.v.price.offerPrice * pick.packs,
    })
  }

  return { matched, skipped, unmatched }
}

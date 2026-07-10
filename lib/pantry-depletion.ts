import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeMealSlots, type MealIngredient } from '@/lib/meal-slots'

// Convert an ingredient quantity into the pantry item's unit so rates and
// balances are computed in one consistent unit per item.
export function toPantryUnit(qty: number, fromUnit?: string | null, toUnit?: string | null): number {
  if (!fromUnit || !toUnit) return qty
  const f = fromUnit.toLowerCase()
  const t = toUnit.toLowerCase()
  if (f === t) return qty
  if (f === 'g' && t === 'kg') return qty / 1000
  if (f === 'kg' && t === 'g') return qty * 1000
  if (f === 'ml' && t === 'l') return qty / 1000
  if (f === 'l' && t === 'ml') return qty * 1000
  return qty
}

function norm(name: string): string {
  return name.trim().toLowerCase()
}

// Average daily usage of each ingredient across the active weekly plan.
// The plan repeats weekly, so weekly_total / 7 is the steady-state daily rate.
// Keyed by normalized name → { perDay, unit }.
export function computeDailyUsage(planData: unknown): Map<string, { perDay: number; unit?: string }> {
  const days = (planData as { days?: Array<Record<string, unknown>> } | undefined)?.days || []
  const weekly = new Map<string, { total: number; unit?: string }>()

  for (const day of days) {
    const slots = normalizeMealSlots((day as { slots?: unknown }).slots)
    for (const slot of slots) {
      for (const ing of slot.ingredients || []) {
        const key = norm(ing.name)
        const qty = ing.qty || 0
        if (!qty) continue
        const existing = weekly.get(key)
        if (existing) {
          existing.total += toPantryUnit(qty, ing.unit, existing.unit)
        } else {
          weekly.set(key, { total: qty, unit: ing.unit })
        }
      }
    }
  }

  const daysCounted = Math.max(days.length, 1)
  const usage = new Map<string, { perDay: number; unit?: string }>()
  for (const [key, { total, unit }] of weekly) {
    usage.set(key, { perDay: total / daysCounted, unit })
  }
  return usage
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const LOW_STOCK_DAYS = 3 // flag "low" when <= 3 days of stock remain

// Recompute est_depletion_date + status for every tracked pantry item using
// the current quantity and the plan-derived consumption rate. This is what
// makes tracking "get smarter": as real quantities are logged, the projected
// run-out date sharpens. Items the plan never uses are left untouched (we
// don't know their burn rate, so we don't guess).
export async function recomputeDepletion(
  db: SupabaseClient,
  userId: string,
  planData?: unknown
): Promise<void> {
  let plan = planData
  if (!plan) {
    const { data } = await db
      .from('meal_plans')
      .select('plan_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    plan = data?.plan_data
  }
  if (!plan) return

  const usage = computeDailyUsage(plan)

  const { data: items } = await db
    .from('pantry_items')
    .select('id, name, quantity, unit')
    .eq('user_id', userId)

  const now = Date.now()

  for (const item of items || []) {
    const qty = Number(item.quantity)
    const rate = usage.get(norm(item.name))

    if (!Number.isFinite(qty)) continue

    if (qty <= 0) {
      await db.from('pantry_items').update({ status: 'out', est_depletion_date: new Date(now).toISOString().slice(0, 10) }).eq('id', item.id)
      continue
    }

    // No known consumption rate → we can't project; leave it as fresh without a date.
    if (!rate || rate.perDay <= 0) {
      await db.from('pantry_items').update({ status: 'fresh', est_depletion_date: null }).eq('id', item.id)
      continue
    }

    const perDay = toPantryUnit(rate.perDay, rate.unit, item.unit)
    const daysRemaining = perDay > 0 ? qty / perDay : Infinity
    const depletionDate = Number.isFinite(daysRemaining)
      ? new Date(now + daysRemaining * MS_PER_DAY).toISOString().slice(0, 10)
      : null
    const status = daysRemaining <= LOW_STOCK_DAYS ? 'low' : 'fresh'

    await db.from('pantry_items').update({ status, est_depletion_date: depletionDate }).eq('id', item.id)
  }
}

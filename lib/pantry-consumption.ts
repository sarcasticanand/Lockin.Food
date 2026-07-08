import type { SupabaseClient } from '@supabase/supabase-js'
import { getDaySlot, type MealIngredient } from '@/lib/meal-slots'

interface PantryItem {
  id: string
  name: string
  quantity: number | string | null
  unit?: string | null
  status?: string | null
}

export interface PantryConsumptionResult {
  consumed: string[]
  lowOrOut: string[]
  missing: string[]
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function thresholdForUnit(unit?: string | null): number {
  const normalized = (unit || '').toLowerCase()
  if (['g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters'].includes(normalized)) return 100
  if (['kg', 'kilogram', 'kilograms', 'l', 'liter', 'liters'].includes(normalized)) return 0.25
  if (['piece', 'pieces', 'pc', 'pcs', 'count'].includes(normalized)) return 2
  return 1
}

function consumedAmount(ingredient: MealIngredient, pantryUnit?: string | null): number {
  if (!ingredient.qty) return 1
  if (!ingredient.unit || !pantryUnit) return ingredient.qty

  const source = ingredient.unit.toLowerCase()
  const target = pantryUnit.toLowerCase()
  if (source === target) return ingredient.qty
  if (source === 'g' && target === 'kg') return ingredient.qty / 1000
  if (source === 'kg' && target === 'g') return ingredient.qty * 1000
  if (source === 'ml' && target === 'l') return ingredient.qty / 1000
  if (source === 'l' && target === 'ml') return ingredient.qty * 1000

  return ingredient.qty
}

async function addMissingItemsToShoppingList(
  db: SupabaseClient,
  userId: string,
  ingredients: MealIngredient[]
) {
  if (!ingredients.length) return

  const { data: list } = await db
    .from('shopping_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const existingItems = Array.isArray(list?.items) ? list.items as Array<Record<string, unknown>> : []
  const existingNames = new Set(existingItems.map((item) => normalizeName(String(item.name || ''))))
  const additions = ingredients
    .filter((ingredient) => !existingNames.has(normalizeName(ingredient.name)))
    .map((ingredient) => ({
      name: ingredient.name,
      qty: ingredient.qty || 1,
      unit: ingredient.unit || 'as needed',
      category: ingredient.category || 'groceries',
      checked: false,
    }))

  if (!additions.length) return

  if (list?.id) {
    await db
      .from('shopping_lists')
      .update({ items: [...existingItems, ...additions] })
      .eq('id', list.id)
  } else {
    await db.from('shopping_lists').insert({
      user_id: userId,
      items: additions,
      ordered: false,
      order_source: 'auto_pantry',
    })
  }
}

export async function consumePantryForMeal(
  db: SupabaseClient,
  userId: string,
  planData: unknown,
  dayIndex: number,
  slotName: string
): Promise<PantryConsumptionResult> {
  const slot = getDaySlot(planData, dayIndex, slotName)
  const ingredients = slot?.ingredients || []
  if (!ingredients.length) return { consumed: [], lowOrOut: [], missing: [] }

  const { data: pantryItems } = await db
    .from('pantry_items')
    .select('id, name, quantity, unit, status')
    .eq('user_id', userId)

  const pantryByName = new Map(
    ((pantryItems || []) as PantryItem[]).map((item) => [normalizeName(item.name), item])
  )

  const consumed: string[] = []
  const lowOrOut = new Set<string>()
  const missingIngredients: MealIngredient[] = []

  for (const ingredient of ingredients) {
    const item = pantryByName.get(normalizeName(ingredient.name))

    if (!item) {
      missingIngredients.push(ingredient)
      lowOrOut.add(ingredient.name)
      continue
    }

    const currentQuantity = Number(item.quantity)
    if (!Number.isFinite(currentQuantity)) {
      if (!['low', 'out'].includes(String(item.status || ''))) {
        await db.from('pantry_items').update({ status: 'low' }).eq('id', item.id)
      }
      consumed.push(item.name)
      lowOrOut.add(item.name)
      continue
    }

    const nextQuantity = Math.max(0, currentQuantity - consumedAmount(ingredient, item.unit))
    const status = nextQuantity <= 0
      ? 'out'
      : nextQuantity <= thresholdForUnit(item.unit)
        ? 'low'
        : 'fresh'

    await db
      .from('pantry_items')
      .update({ quantity: nextQuantity, status })
      .eq('id', item.id)

    consumed.push(item.name)
    if (status === 'low' || status === 'out') lowOrOut.add(item.name)
  }

  await addMissingItemsToShoppingList(db, userId, missingIngredients)

  return {
    consumed,
    lowOrOut: Array.from(lowOrOut),
    missing: missingIngredients.map((ingredient) => ingredient.name),
  }
}


export interface MealIngredient {
  name: string
  qty?: number
  unit?: string
  category?: string
}

export interface MealSlot {
  slot: string
  time: string
  meal: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  ingredients: MealIngredient[]
  raw: Record<string, unknown>
}

const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early Morning',
  breakfast: 'Breakfast',
  mid_morning: 'Mid-Morning',
  lunch: 'Lunch',
  evening_snack: 'Evening Snack',
  dinner: 'Dinner',
  pre_bed: 'Pre-Bed',
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeIngredient(value: unknown): MealIngredient | null {
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { name } : null
  }

  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const name = String(record.name || record.item || record.ingredient || '').trim()
  if (!name) return null

  const qtyValue = record.qty ?? record.quantity ?? record.grams
  const qty = qtyValue === undefined || qtyValue === null ? undefined : toNumber(qtyValue)

  return {
    name,
    ...(qty ? { qty } : {}),
    ...(record.unit ? { unit: String(record.unit) } : {}),
    ...(record.category ? { category: String(record.category) } : {}),
  }
}

export function normalizeMealSlots(slotsInput: unknown): MealSlot[] {
  const entries = Array.isArray(slotsInput)
    ? slotsInput.map((slot) => ({ key: undefined, value: slot }))
    : slotsInput && typeof slotsInput === 'object'
      ? Object.entries(slotsInput as Record<string, unknown>).map(([key, value]) => ({ key, value }))
      : []

  return entries
    .map(({ key, value }) => {
      if (!value || typeof value !== 'object') return null

      const raw = value as Record<string, unknown>
      const slot = String(raw.slot || raw.name || key || '').trim()
      if (!slot) return null

      const meal = String(raw.meal || raw.description || raw.food || raw.name || slotLabel(slot)).trim()
      const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
      const ingredients = rawIngredients
        .map(normalizeIngredient)
        .filter((ingredient): ingredient is MealIngredient => Boolean(ingredient))

      return {
        slot,
        time: String(raw.time || ''),
        meal,
        kcal: toNumber(raw.kcal ?? raw.calories),
        protein_g: toNumber(raw.protein_g),
        carbs_g: toNumber(raw.carbs_g),
        fat_g: toNumber(raw.fat_g),
        ingredients,
        raw,
      }
    })
    .filter((slot): slot is MealSlot => Boolean(slot))
}

export function getDaySlots(planData: unknown, dayIndex: number): MealSlot[] {
  const days = (planData as { days?: Array<Record<string, unknown>> } | undefined)?.days
  const day = days?.[dayIndex]
  return normalizeMealSlots(day?.slots)
}

export function getDaySlot(planData: unknown, dayIndex: number, slotName: string): MealSlot | undefined {
  return getDaySlots(planData, dayIndex).find((slot) => slot.slot === slotName)
}

export function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] || slot.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function messageSlotFromType(messageType: string): string | null {
  const match = messageType.match(/^post_(.+)$/)
  return match?.[1] || null
}


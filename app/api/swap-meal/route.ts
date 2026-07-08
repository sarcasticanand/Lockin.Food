import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { generateChatContent } from '@/lib/gemini'
import { normalizeMealSlots } from '@/lib/meal-slots'

interface Alternative {
  meal: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  reason: string
}

// POST /api/swap-meal — generate alternatives for a slot on any day
// Body: { userId, dayIndex, slot }
export async function POST(req: NextRequest) {
  const db = getServerClient()

  try {
    const { userId, dayIndex, slot } = await req.json()
    if (!userId || dayIndex == null || !slot) {
      return NextResponse.json({ error: 'userId, dayIndex, slot required' }, { status: 400 })
    }

    const [{ data: user }, { data: plan }] = await Promise.all([
      db.from('users').select('*').eq('id', userId).single(),
      db.from('meal_plans').select('plan_data').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }).limit(1).single(),
    ])

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!plan) return NextResponse.json({ error: 'No active plan' }, { status: 404 })

    const planData = plan.plan_data as { days?: Array<Record<string, unknown>> }
    const day = planData?.days?.[dayIndex] as Record<string, unknown> | undefined
    const slots = normalizeMealSlots(day?.slots)
    const currentSlot = slots?.find(s => s.slot === slot)
    if (!currentSlot) return NextResponse.json({ error: `Slot ${slot} not found on day ${dayIndex}` }, { status: 404 })

    const goal = (user.goal as string) || 'healthy eating'
    const restrictions: string[] = []
    if (!user.okay_with_dairy) restrictions.push('no dairy')
    if (!user.okay_with_eggs) restrictions.push('no eggs')
    if (!user.okay_with_meat_fish) restrictions.push('no meat or fish')
    if ((user.allergies as string[])?.length) restrictions.push(`allergic to: ${(user.allergies as string[]).join(', ')}`)

    const prompt = `User wants to swap ${currentSlot.meal || slot} for ${slot} on their ${goal} diet. Suggest 3 alternative Indian meals with similar calories (around ${currentSlot.kcal || 300} kcal) and macros. User restrictions: ${restrictions.join(', ') || 'none'}. Return JSON only: {"alternatives": [{"meal": "string", "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "reason": "string"}]}`

    const raw = await generateChatContent('You are a nutrition expert. Return only valid JSON, no markdown.', prompt)
    const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    const alternatives: Alternative[] = parsed.alternatives || []

    if (!alternatives.length) return NextResponse.json({ error: 'No alternatives generated' }, { status: 502 })
    return NextResponse.json({ alternatives })
  } catch (e) {
    console.error('[swap-meal POST]', e)
    return NextResponse.json({ error: 'Could not generate alternatives' }, { status: 500 })
  }
}

// PATCH /api/swap-meal — apply a chosen alternative to the plan
// Body: { userId, dayIndex, slot, alternative: { meal, kcal, protein_g, carbs_g, fat_g } }
export async function PATCH(req: NextRequest) {
  const db = getServerClient()

  try {
    const { userId, dayIndex, slot, alternative } = await req.json()
    if (!userId || dayIndex == null || !slot || !alternative?.meal) {
      return NextResponse.json({ error: 'userId, dayIndex, slot, alternative required' }, { status: 400 })
    }

    const { data: plan } = await db
      .from('meal_plans')
      .select('id, plan_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!plan) return NextResponse.json({ error: 'No active plan' }, { status: 404 })

    const planData = plan.plan_data as { days?: Array<Record<string, unknown>> }
    const days = [...(planData.days || [])]
    const day = { ...(days[dayIndex] as Record<string, unknown>) }
    if (!day) return NextResponse.json({ error: `Day ${dayIndex} not found` }, { status: 404 })

    const slots = normalizeMealSlots(day.slots)
    const slotIdx = slots.findIndex(s => s.slot === slot)
    if (slotIdx === -1) return NextResponse.json({ error: `Slot ${slot} not found` }, { status: 404 })

    slots[slotIdx] = {
      ...slots[slotIdx],
      raw: {
        ...slots[slotIdx].raw,
        meal: alternative.meal,
        kcal: Number(alternative.kcal || 0),
        protein_g: Number(alternative.protein_g || 0),
        carbs_g: Number(alternative.carbs_g || 0),
        fat_g: Number(alternative.fat_g || 0),
      },
      meal: alternative.meal,
      kcal: Number(alternative.kcal || 0),
      protein_g: Number(alternative.protein_g || 0),
      carbs_g: Number(alternative.carbs_g || 0),
      fat_g: Number(alternative.fat_g || 0),
    }
    day.slots = slots.map(s => s.raw)
    days[dayIndex] = day

    const { error } = await db
      .from('meal_plans')
      .update({ plan_data: { ...planData, days } })
      .eq('id', plan.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, slot: slots[slotIdx].raw })
  } catch (e) {
    console.error('[swap-meal PATCH]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

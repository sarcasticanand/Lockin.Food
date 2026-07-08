import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { getDaySlot } from '@/lib/meal-slots'
import { consumePantryForMeal } from '@/lib/pantry-consumption'

// POST /api/log-meal
// Body: { userId, slot, action: 'eaten' | 'skipped' }
// Mirrors the Telegram bot's logMealEaten/logMealSkipped conventions exactly,
// so web and bot logging stay interchangeable.

export async function POST(req: NextRequest) {
  const db = getServerClient()

  try {
    const { userId, slot, action } = await req.json()

    if (!userId || !slot || !['eaten', 'skipped'].includes(action)) {
      return NextResponse.json({ error: 'userId, slot, action (eaten|skipped) required' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: log } = await db.from('daily_logs').select('*').eq('user_id', userId).eq('log_date', today).single()

    if (action === 'skipped') {
      const meals_skipped = [...((log?.meals_skipped as string[]) || [])]
      if (!meals_skipped.includes(slot)) meals_skipped.push(slot)
      await db.from('daily_logs').upsert({ user_id: userId, log_date: today, meals_skipped }, { onConflict: 'user_id,log_date' })
      return NextResponse.json({ ok: true, skipped: meals_skipped })
    }

    // action === 'eaten' — look up the planned slot server-side for trusted macros
    const existing = (log?.meals_eaten as Array<Record<string, unknown>>) || []
    if (existing.some(m => m.slot === slot)) {
      return NextResponse.json({ ok: true, alreadyLogged: true, total_kcal: log?.total_kcal || 0, total_protein_g: log?.total_protein_g || 0 })
    }

    const { data: plan } = await db
      .from('meal_plans')
      .select('plan_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const dayIndex = new Date().getDay()
    const slotData = getDaySlot(plan?.plan_data, dayIndex, slot)

    const meals_eaten = [...existing, {
      slot,
      name: slotData?.meal || slot,
      kcal: Number(slotData?.kcal || 0),
      protein_g: Number(slotData?.protein_g || 0),
      carbs_g: Number(slotData?.carbs_g || 0),
      fat_g: Number(slotData?.fat_g || 0),
      logged_at: new Date().toISOString(),
    }]
    const typed = meals_eaten as Array<Record<string, number>>
    const total_kcal = typed.reduce((sum, m) => sum + (m.kcal || 0), 0)
    const total_protein_g = typed.reduce((sum, m) => sum + (m.protein_g || 0), 0)
    const total_carbs_g = typed.reduce((sum, m) => sum + (m.carbs_g || 0), 0)
    const total_fat_g = typed.reduce((sum, m) => sum + (m.fat_g || 0), 0)

    await db.from('daily_logs').upsert({
      user_id: userId,
      log_date: today,
      meals_eaten,
      total_kcal,
      total_protein_g,
      total_carbs_g,
      total_fat_g,
    }, { onConflict: 'user_id,log_date' })

    const pantry = plan?.plan_data
      ? await consumePantryForMeal(db, userId, plan.plan_data, dayIndex, slot)
      : null

    return NextResponse.json({ ok: true, total_kcal, total_protein_g, total_carbs_g, total_fat_g, pantry })
  } catch (e) {
    console.error('[log-meal]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

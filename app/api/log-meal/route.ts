import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { userId, slot, meal, kcal, protein_g } = await req.json();
    const db = getServerClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: log } = await db
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', today)
      .single();

    type MealEntry = { slot: string; meal: string; kcal: number; protein_g: number; logged_at: string };
    const mealsEaten: MealEntry[] = (log?.meals_eaten as MealEntry[] || []);
    mealsEaten.push({ slot, meal, kcal: Number(kcal), protein_g: Number(protein_g), logged_at: new Date().toISOString() });

    const totalKcal = mealsEaten.reduce((s, m) => s + (m.kcal || 0), 0);
    const totalProtein = mealsEaten.reduce((s, m) => s + (m.protein_g || 0), 0);

    if (log) {
      await db.from('daily_logs').update({
        meals_eaten: mealsEaten,
        total_kcal: totalKcal,
        total_protein_g: totalProtein,
        updated_at: new Date().toISOString(),
      }).eq('id', log.id);
    } else {
      await db.from('daily_logs').insert({
        user_id: userId,
        log_date: today,
        meals_eaten: mealsEaten,
        total_kcal: totalKcal,
        total_protein_g: totalProtein,
      });
    }

    return NextResponse.json({ ok: true, totalKcal, totalProtein });
  } catch (e) {
    console.error('[log-meal]', e);
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
  }
}

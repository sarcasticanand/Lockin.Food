import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

// PATCH /api/plan/edit
// Body: { userId, dayIndex, slotName, meal }
// Updates a single meal slot in plan_data JSONB

export async function PATCH(req: NextRequest) {
  const db = getServerClient();

  try {
    const { userId, dayIndex, slotName, meal } = await req.json();

    if (!userId || dayIndex == null || !slotName || !meal) {
      return NextResponse.json({ error: 'userId, dayIndex, slotName, meal required' }, { status: 400 });
    }

    // Fetch current plan
    const { data: plan, error: fetchError } = await db
      .from('meal_plans')
      .select('id, plan_data')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !plan) {
      return NextResponse.json({ error: 'No active plan found' }, { status: 404 });
    }

    // Deep-clone and patch the slot
    const planData = plan.plan_data as { days?: Record<string, unknown>[] };
    const days = planData?.days || [];

    const day = days[dayIndex] as { slots?: Record<string, unknown>[] } | undefined;
    if (!day) {
      return NextResponse.json({ error: `Day ${dayIndex} not found in plan` }, { status: 404 });
    }

    const slotIndex = day.slots?.findIndex((s: Record<string, unknown>) => s.slot === slotName) ?? -1;
    if (slotIndex === -1) {
      return NextResponse.json({ error: `Slot ${slotName} not found` }, { status: 404 });
    }

    // Patch meal name (keep all other slot fields intact)
    (day.slots![slotIndex] as Record<string, unknown>).meal = meal;

    const { error: updateError } = await db
      .from('meal_plans')
      .update({ plan_data: planData, updated_at: new Date().toISOString() })
      .eq('id', plan.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[plan/edit]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

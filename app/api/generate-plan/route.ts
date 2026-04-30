import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { buildMealPlanPrompt } from '@/lib/prompt-builder';
import { getPlanModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId);

    const prompt = await buildMealPlanPrompt(user, pantryItems || []);

    const model = getPlanModel();
    const result = await model.generateContent(prompt);
    let text = result.response
      .text()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let planData: { days: unknown[] };
    try {
      const parsed = JSON.parse(text);
      planData = Array.isArray(parsed) ? { days: parsed } : parsed;
      if (!planData.days) throw new Error('No days array in response');
    } catch (parseError) {
      console.error('[generate-plan] Failed to parse AI response:', parseError);
      return NextResponse.json(
        { error: 'AI returned invalid format. Try again.' },
        { status: 500 }
      );
    }

    await supabase
      .from('meal_plans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    const { data: newPlan, error: insertError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: userId,
        week_start: new Date().toISOString().split('T')[0],
        plan_data: planData,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[generate-plan] DB insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan: newPlan });
  } catch (error) {
    console.error('[generate-plan] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

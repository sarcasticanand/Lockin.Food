import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const today = new Date().toISOString().split('T')[0];

  const [
    { data: user },
    { data: plan },
    { data: log },
    { data: pantryAlerts },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', uid).single(),
    supabase.from('meal_plans').select('*').eq('user_id', uid).eq('is_active', true).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('daily_logs').select('*').eq('user_id', uid).eq('log_date', today).single(),
    supabase.from('pantry_items').select('id').eq('user_id', uid).in('status', ['low', 'expired', 'out']),
  ]);

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const dayIndex = new Date().getDay();
  const todayPlan = plan?.plan_data?.days?.[dayIndex];

  return NextResponse.json({
    user: {
      telegram_username: user.telegram_username,
      current_streak: user.current_streak || 0,
      target_kcal: user.target_kcal || 0,
      target_protein_g: user.target_protein_g || 0,
      target_carbs_g: user.target_carbs_g || 0,
      target_fat_g: user.target_fat_g || 0,
    },
    todaySlots: todayPlan?.slots || null,
    log: {
      kcal: { current: log?.total_kcal || 0, target: user.target_kcal || 2000 },
      protein: { current: log?.total_protein_g || 0, target: user.target_protein_g || 150 },
      carbs: { current: log?.total_carbs_g || 0, target: user.target_carbs_g || 200 },
      fat: { current: log?.total_fat_g || 0, target: user.target_fat_g || 50 },
    },
    pantryAlerts: pantryAlerts?.length || 0,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', uid)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ days: plan?.plan_data?.days || [] });
}

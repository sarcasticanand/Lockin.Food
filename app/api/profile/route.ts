import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const { data } = await supabase.from('users').select('*').eq('id', uid).single();
  return NextResponse.json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServerClient();
  const { userId, ...updates } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

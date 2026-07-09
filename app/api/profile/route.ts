import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { pickWritableUserFields } from '@/lib/user-fields';

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const { data } = await supabase.from('users').select('*').eq('id', uid).single();
  return NextResponse.json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServerClient();
  const { userId, ...rawUpdates } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Restrict to allowlisted columns — never let a caller write link_token,
  // otp_code, telegram_chat_id, phone_number of another account, etc.
  const updates = pickWritableUserFields(rawUpdates);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

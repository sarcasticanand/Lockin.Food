import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const { data } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  const { userId, name, quantity, unit, category } = await req.json();
  if (!userId || !name) return NextResponse.json({ error: 'userId and name required' }, { status: 400 });

  const { data } = await supabase
    .from('pantry_items')
    .insert({
      user_id: userId,
      name,
      quantity,
      unit: unit || 'g',
      category,
      status: 'fresh',
    })
    .select()
    .single();

  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServerClient();
  const { id, status, quantity } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (quantity !== undefined) updates.quantity = quantity;

  const { data } = await supabase
    .from('pantry_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = getServerClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await supabase.from('pantry_items').delete().eq('id', id);
  return NextResponse.json({ success: true });
}

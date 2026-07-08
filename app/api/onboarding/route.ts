import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const db = getServerClient();
  try {
    const body = await req.json();
    const { telegramChatId, ...profileData } = body;

    const chatId = telegramChatId ? Number(telegramChatId) : null;
    const phone = profileData.phone_number as string | undefined;

    let userId: string | undefined;

    // Try to find existing user by telegram chat ID or phone number
    let existing: Record<string, unknown> | null = null;
    if (chatId) {
      const { data } = await db.from('users').select('id').eq('telegram_chat_id', chatId).single();
      existing = data;
    }
    if (!existing && phone) {
      const { data } = await db.from('users').select('id').eq('phone_number', phone).single();
      existing = data;
    }

    if (existing) {
      const updatePayload = { ...profileData, updated_at: new Date().toISOString() };
      if (chatId) Object.assign(updatePayload, { telegram_chat_id: chatId });
      const { error: updateError } = await db.from('users').update(updatePayload).eq('id', existing.id);
      if (updateError) {
        console.error('[onboarding] update error:', updateError);
        return NextResponse.json({ error: updateError.message || 'Failed to update profile' }, { status: 500 });
      }
      userId = existing.id as string;
    } else {
      const insertPayload = chatId ? { telegram_chat_id: chatId, ...profileData } : { ...profileData };
      const { data: inserted, error: insertError } = await db
        .from('users')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError || !inserted) {
        console.error('[onboarding] insert error:', insertError);
        return NextResponse.json({ error: insertError?.message || 'Failed to save profile' }, { status: 500 });
      }
      userId = inserted.id;
    }

    if (!userId) {
      return NextResponse.json({ error: 'No user ID returned' }, { status: 500 });
    }

    // Generate a 16-char link token for Telegram deep-link account linking
    const linkToken = crypto.randomBytes(8).toString('hex');
    const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.from('users').update({ link_token: linkToken, link_token_expires_at: tokenExpiry }).eq('id', userId);

    return NextResponse.json({ success: true, userId, linkToken, planReady: false });
  } catch (e) {
    console.error('[onboarding] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

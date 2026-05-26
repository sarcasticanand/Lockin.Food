import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const db = getServerClient();
  try {
    const body = await req.json();
    const { telegramChatId, ...profileData } = body;

    const chatId = telegramChatId ? Number(telegramChatId) : null;

    let userId: string | undefined;

    if (chatId) {
      const { data: updated, error: updateError } = await db
        .from('users')
        .update({ ...profileData, updated_at: new Date().toISOString() })
        .eq('telegram_chat_id', chatId)
        .select()
        .single();

      userId = updated?.id;

      if (updateError || !updated) {
        const { data: inserted, error: insertError } = await db
          .from('users')
          .insert({ telegram_chat_id: chatId, ...profileData })
          .select()
          .single();

        if (insertError || !inserted) {
          console.error('[onboarding] insert error:', insertError);
          return NextResponse.json({ error: insertError?.message || 'Failed to save profile' }, { status: 500 });
        }
        userId = inserted.id;
      }
    } else {
      const { data: inserted, error: insertError } = await db
        .from('users')
        .insert({ ...profileData })
        .select()
        .single();

      if (insertError || !inserted) {
        console.error('[onboarding] insert error (no tg):', insertError);
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

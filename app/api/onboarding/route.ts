import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const db = getServerClient();
  try {
    const body = await req.json();
    // phone is stripped here — add it back after running: ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
    const { telegramChatId, phone: _phone, ...profileData } = body;
    void _phone;

    const chatId = telegramChatId ? Number(telegramChatId) : null;

    let userId: string | undefined;

    if (chatId) {
      // User came from Telegram — try UPDATE first (user created when they sent /start)
      const { data: updated, error: updateError } = await db
        .from('users')
        .update({ ...profileData, updated_at: new Date().toISOString() })
        .eq('telegram_chat_id', chatId)
        .select()
        .single();

      userId = updated?.id;

      if (updateError || !updated) {
        // User doesn't exist yet — INSERT with telegram_chat_id
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
      // No Telegram — just INSERT a new user record (web-only signup)
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

    // Trigger plan generation (awaited so we can return planReady)
    let planReady = false;
    try {
      const res = await fetch(`${process.env.APP_URL}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      planReady = res.ok;
    } catch (e) {
      console.error('[onboarding] plan gen error:', e);
    }

    return NextResponse.json({ success: true, userId, planReady });
  } catch (e) {
    console.error('[onboarding] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  try {
    const body = await req.json();
    const { telegramChatId, ...profileData } = body;

    if (!telegramChatId) {
      return NextResponse.json({ error: 'telegramChatId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          telegram_chat_id: telegramChatId,
          ...profileData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_chat_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[onboarding] DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data?.id && data.onboarding_complete) {
      fetch(`${process.env.APP_URL}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.id }),
      }).catch((e) => console.error('[onboarding] auto plan generation failed:', e));
    }

    return NextResponse.json({ success: true, userId: data?.id });
  } catch (e) {
    console.error('[onboarding] error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

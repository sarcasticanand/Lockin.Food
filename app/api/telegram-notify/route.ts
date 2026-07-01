import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function POST(req: NextRequest) {
  try {
    const { username, userId, message, chatId } = await req.json();
    const db = getServerClient();

    let targetChatId: number | null = chatId || null;

    if (!targetChatId && userId) {
      const { data: user } = await db.from('users').select('telegram_chat_id').eq('id', userId).single();
      targetChatId = user?.telegram_chat_id || null;
    }

    if (!targetChatId && username) {
      const clean = (username as string).replace('@', '');
      const { data: user } = await db.from('users').select('telegram_chat_id').eq('telegram_username', clean).single();
      targetChatId = user?.telegram_chat_id || null;
    }

    if (!targetChatId) {
      const identifier = userId || username;
      if (identifier) {
        await db.from('pending_notifications').insert({ user_identifier: identifier, message });
      }
      return NextResponse.json({ sent: false, reason: 'No chat_id — message queued for delivery on /start' });
    }

    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: 'Markdown' }),
    });
    const result = await response.json();
    return NextResponse.json({ sent: result.ok, result });
  } catch (error) {
    console.error('[telegram-notify]', error);
    return NextResponse.json({ sent: false, error: 'Internal error' }, { status: 500 });
  }
}

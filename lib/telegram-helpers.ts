const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

// Meal confirmation buttons per PRD Section 7.3
export function mealConfirmButtons(slot: string) {
  return [
    [
      { text: '✅ Yes', callback_data: `confirm:${slot}:yes` },
      { text: '🔄 Had something else', callback_data: `confirm:${slot}:other` },
      { text: '⏭️ Skipped', callback_data: `confirm:${slot}:skip` },
    ],
  ]
}

// Pantry low-stock buttons per PRD Section 7.5
export function pantryAlertButtons(itemName: string) {
  return [
    [
      { text: '📝 Add to list', callback_data: `pantry:add:${itemName}` },
      { text: "I'll buy some", callback_data: `pantry:buy:${itemName}` },
      { text: 'Skip', callback_data: `pantry:skip:${itemName}` },
    ],
  ]
}

// Split and send a message (Telegram max 4096 chars per message)
export async function sendMessage(chatId: number, text: string): Promise<void> {
  const MAX_LENGTH = 4000;
  const chunks = text.length > MAX_LENGTH
    ? text.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'gs')) || [text]
    : [text];

  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
  }
}

// Send message with inline keyboard buttons
export async function sendButtons(
  chatId: number,
  text: string,
  buttons: { text: string; callback_data: string }[][]
): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    }),
  });
}

// Answer callback query (dismiss loading spinner on inline keyboard press)
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  });
}

// Send typing indicator
export async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing',
    }),
  });
}

// Format a meal slot name for display
export function formatSlotName(slot: string): string {
  const names: Record<string, string> = {
    early_morning: '🌅 Early Morning',
    breakfast: '🍳 Breakfast',
    mid_morning: '🍎 Mid-Morning',
    lunch: '🍱 Lunch',
    evening_snack: '☕ Evening Snack',
    dinner: '🌙 Dinner',
    pre_bed: '🌛 Pre-Bed',
  };
  return names[slot] || slot;
}

// Format a number as a macro bar: "138g / 150g ████░░░░ 92%"
export function formatMacroBar(current: number, target: number, unit: string): string {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `${current}${unit} / ${target}${unit} ${bar} ${pct}%`;
}

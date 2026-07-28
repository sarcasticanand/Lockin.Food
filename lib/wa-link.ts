// Deep links into the WhatsApp chat with Kanshi.
//
// These are the backbone of the zero-cost messaging model: a wa.me link with
// prefilled text means the USER sends the first message, which opens Meta's
// free 24-hour service window. We never pay for a business-initiated template
// as long as re-engagement happens through these links (email, web, calendar).

// Business number in E.164 without '+' (e.g. 918368555072).
export const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || process.env.WHATSAPP_NUMBER || ''

export function waLink(prefill?: string): string {
  const base = `https://wa.me/${WA_NUMBER}`
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base
}

// Prefilled openers used across the product. Keep them short and natural —
// the user sees this text sitting in their WhatsApp input box before they tap
// send, so it should read like something they'd actually type.
export const WA_PREFILL = {
  start: "Hi Kanshi, I'm ready to start",
  plan: 'Send me my plan for today',
  winback: "Hi Kanshi, I'm back. Send me today's plan",
  logMeal: 'I want to log a meal',
} as const

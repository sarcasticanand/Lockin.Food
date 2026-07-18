import type { BotChannel, BotButton } from '@/lib/bot-engine'

// WhatsApp Cloud API (Meta-hosted, no BSP) helpers.
// Env: WHATSAPP_TOKEN (permanent system-user token), WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_VERIFY_TOKEN (any secret string, echoed during webhook setup).

const GRAPH = 'https://graph.facebook.com/v25.0'

function api() {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set')
  return { token, phoneNumberId }
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  const { token, phoneNumberId } = api()
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    console.error('[whatsapp] send failed:', res.status, err.slice(0, 300))
  }
  return res.ok
}

// WhatsApp renders *bold* and _italic_ like our Telegram Markdown, but does
// NOT render [text](url) links — convert those to "text: url".
function sanitize(text: string): string {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1: $2')
}

export async function waSendMessage(to: string, text: string): Promise<void> {
  const body = sanitize(text)
  const MAX = 4000
  const chunks = body.length > MAX ? body.match(new RegExp(`.{1,${MAX}}`, 'gs')) || [body] : [body]
  for (const chunk of chunks) {
    await post({ to, type: 'text', text: { body: chunk, preview_url: false } })
  }
}

// Interactive reply buttons: max 3 buttons, titles max 20 chars, body max 1024.
// Longer bodies are sent as a plain message first, then a short button prompt.
export async function waSendButtons(to: string, text: string, buttons: BotButton[][]): Promise<void> {
  const flat = buttons.flat().slice(0, 3)
  let body = sanitize(text)
  if (body.length > 1000) {
    await waSendMessage(to, body)
    body = 'Choose an option:'
  }
  await post({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: flat.map(b => ({
          type: 'reply',
          reply: { id: b.data.slice(0, 256), title: b.text.slice(0, 20) },
        })),
      },
    },
  })
}

// Mark the incoming message read and show a typing indicator.
export async function waMarkReadAndType(messageId: string): Promise<void> {
  await post({ status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }).catch(() => {})
}

// Send a pre-approved template message (the only way to reach a user whose
// 24h service window has closed; billed per message by Meta). Returns whether
// Meta accepted it, so callers only mark a nudge as sent when it really went.
export async function waSendTemplate(to: string, templateName: string, bodyParams: string[] = []): Promise<boolean> {
  return post({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      ...(bodyParams.length > 0
        ? { components: [{ type: 'body', parameters: bodyParams.map(t => ({ type: 'text', text: t })) }] }
        : {}),
    },
  })
}

// Download an inbound media item (two-step: media-id → URL → binary, both authed).
export async function waDownloadMedia(mediaId: string): Promise<{ base64: string; mime: string }> {
  const { token } = api()
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
  const meta = await metaRes.json()
  if (!meta?.url) throw new Error('No media URL from WhatsApp')
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  return {
    base64: Buffer.from(await binRes.arrayBuffer()).toString('base64'),
    mime: String(meta.mime_type || 'image/jpeg'),
  }
}

export function whatsappChannel(to: string, inboundMessageId?: string): BotChannel {
  return {
    channel: 'whatsapp',
    send: (text: string) => waSendMessage(to, text),
    sendButtons: (text: string, buttons: BotButton[][]) => waSendButtons(to, text, buttons),
    typing: () => (inboundMessageId ? waMarkReadAndType(inboundMessageId) : Promise.resolve()),
    downloadPhoto: (mediaId: string) => waDownloadMedia(mediaId),
  }
}

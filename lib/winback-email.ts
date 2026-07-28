import { Resend } from 'resend'
import { waLink, WA_PREFILL } from '@/lib/wa-link'

// Win-back by email instead of a paid WhatsApp template.
//
// The email contains a wa.me link with prefilled text. Tapping it opens
// WhatsApp with the message already typed; the user just hits send. Because
// the USER sends first, Meta's free 24-hour service window opens and the
// entire re-engagement costs nothing on WhatsApp (Resend's free tier covers
// the email). This is why the bot never needs business-initiated templates.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export function winbackEmailHtml(firstName: string, daysAway: number): string {
  const link = waLink(WA_PREFILL.winback)
  const gap = daysAway >= 7 ? `It's been about a week` : `It's been a few days`
  return `<!doctype html>
<html><body style="margin:0;background:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:22px;font-weight:700;color:#2D4A3E;margin:0 0 24px">Lockin</p>
    <p style="font-size:16px;color:#1A1F1B;line-height:1.6;margin:0 0 16px">Hi ${firstName},</p>
    <p style="font-size:16px;color:#1A1F1B;line-height:1.6;margin:0 0 16px">
      ${gap} since we last spoke. Your meal plan is still here and still up to date.
    </p>
    <p style="font-size:16px;color:#1A1F1B;line-height:1.6;margin:0 0 28px">
      Pick up where you left off, one tap and I'll send today's plan.
    </p>
    <a href="${link}" style="display:inline-block;background:#2D4A3E;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">
      Continue on WhatsApp
    </a>
    <p style="font-size:13px;color:#6B7268;line-height:1.6;margin:28px 0 0">
      That link opens WhatsApp with a message ready to send. No typing needed.
    </p>
    <p style="font-size:12px;color:#9AA096;line-height:1.6;margin:32px 0 0;border-top:1px solid #E8E4DC;padding-top:16px">
      Don't want these? Reply STOP on WhatsApp and I'll stop emailing.
    </p>
  </div>
</body></html>`
}

export async function sendWinbackEmail(to: string, firstName: string, daysAway: number): Promise<boolean> {
  if (!resend) {
    console.error('[winback-email] RESEND_API_KEY not set')
    return false
  }
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Lockin <onboarding@resend.dev>',
      to,
      subject: `${firstName}, your meal plan is waiting`,
      html: winbackEmailHtml(firstName, daysAway),
    })
    if (error) {
      console.error('[winback-email] send failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('[winback-email] threw:', e)
    return false
  }
}

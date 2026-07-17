import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { getDaySlots, slotLabel } from '@/lib/meal-slots'
import { istDateString, addDaysToDateString } from '@/lib/time'

// Personal meal-plan calendar feed (ICS). Users subscribe to this URL once in
// Google/Apple Calendar; the calendar app re-fetches it periodically, so plan
// changes propagate without us sending anything.
//
// Deliberately thin: only today + tomorrow, meal name + time, no macros. The
// calendar is a nudge layer that points back to the bot — logging, swapping,
// questions, and the full plan all live in chat. Serving the whole week here
// would cannibalise the bot as the daily surface.

const DAYS_AHEAD = 2
const MEAL_DURATION_MIN = 30

// Escape per RFC 5545: backslash, comma, semicolon, newline
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Fold lines longer than 74 octets (RFC 5545 §3.1) — continuation lines start with a space
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  return parts.join('\r\n')
}

function dayIndexOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0 = Sunday, matches plan day_index
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params
  const db = getServerClient()

  const { data: user } = await db.from('users').select('*').eq('id', uid).maybeSingle()
  if (!user) return new NextResponse('Not found', { status: 404 })

  // Deep link back into the chat — the calendar's job is to bring them to the bot.
  const waNumber = process.env.WHATSAPP_NUMBER
  const tgBot = process.env.TELEGRAM_BOT_USERNAME
  const botLink = user.whatsapp_connected && waNumber
    ? `https://wa.me/${waNumber}`
    : tgBot
      ? `https://t.me/${tgBot}`
      : process.env.APP_URL || 'https://lockin.food'

  const { data: plan } = await db
    .from('meal_plans')
    .select('plan_data, created_at')
    .eq('user_id', uid)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//lockin.food//Meal Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:lockin.food — Meals',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'X-PUBLISHED-TTL:PT4H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const todayIST = istDateString()

  if (plan?.plan_data) {
    for (let offset = 0; offset < DAYS_AHEAD; offset++) {
      const dateStr = addDaysToDateString(todayIST, offset)
      const slots = getDaySlots(plan.plan_data, dayIndexOf(dateStr))
      for (const slot of slots) {
        if (!/^\d{1,2}:\d{2}$/.test(slot.time)) continue
        const [h, m] = slot.time.split(':').map(Number)
        const startMin = h * 60 + m
        const endMin = startMin + MEAL_DURATION_MIN
        const dateCompact = dateStr.replace(/-/g, '')
        const toICSTime = (min: number) =>
          `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`

        const summary = `${slotLabel(slot.slot)}: ${slot.meal}`
        const description = `Log it, swap it, or ask anything — message Kanshi:\n${botLink}`

        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}-${dateStr}-${slot.slot}@lockin.food`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;TZID=Asia/Kolkata:${dateCompact}T${toICSTime(startMin)}`,
          `DTEND;TZID=Asia/Kolkata:${dateCompact}T${toICSTime(endMin)}`,
          fold(`SUMMARY:${esc(summary)}`),
          fold(`DESCRIPTION:${esc(description)}`),
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:Meal time',
          'TRIGGER:-PT10M',
          'END:VALARM',
          'END:VEVENT',
        )
      }
    }
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lockin-meals.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

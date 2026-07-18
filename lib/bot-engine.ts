import { getServerClient } from '@/lib/supabase'
import { buildSystemPrompt } from '@/lib/prompt-builder'
import { generateChatContent, generateChatWithHistory, analyzeMealPhoto, type ChatMessage } from '@/lib/gemini'
import { getDaySlots, normalizeMealSlots, slotLabel } from '@/lib/meal-slots'
import { getDaySlot } from '@/lib/meal-slots'
import { consumePantryForMeal, type PantryConsumptionResult } from '@/lib/pantry-consumption'
import { istDateString } from '@/lib/time'

// ============================================================
// Channel abstraction — one bot brain, many messengers.
// Telegram and WhatsApp webhooks parse their own payloads into a
// BotEvent, provide a BotChannel for replies, and delegate here.
// ============================================================

export interface BotButton {
  text: string
  data: string // callback payload, must survive a round-trip (<= 64 bytes for Telegram, <= 256 for WhatsApp)
}

export interface BotChannel {
  channel: 'telegram' | 'whatsapp'
  send(text: string): Promise<void>
  sendButtons(text: string, buttons: BotButton[][]): Promise<void>
  typing(): Promise<void>
  downloadPhoto(photoId: string): Promise<{ base64: string; mime: string }>
}

export interface BotEvent {
  text: string
  callbackData: string
  photoId?: string
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const SLOT_EMOJI: Record<string, string> = {
  early_morning: '🌅 Early Morning',
  breakfast: '🍳 Breakfast',
  mid_morning: '🍎 Mid-Morning',
  lunch: '🍱 Lunch',
  evening_snack: '☕ Evening Snack',
  dinner: '🌙 Dinner',
  pre_bed: '🌛 Pre-Bed',
}

function mealConfirmButtons(slot: string): BotButton[][] {
  return [[
    { text: '✅ Yes', data: `confirm:${slot}:yes` },
    { text: '🔄 Something else', data: `confirm:${slot}:other` },
    { text: '⏭️ Skipped', data: `confirm:${slot}:skip` },
  ]]
}

function pantryAlertButtons(itemName: string): BotButton[][] {
  return [[
    { text: '📝 Add to list', data: `pantry:add:${itemName}` },
    { text: "I'll buy some", data: `pantry:buy:${itemName}` },
    { text: 'Skip', data: `pantry:skip:${itemName}` },
  ]]
}

async function getActivePlan(userId: string) {
  const { data } = await getServerClient()
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data
}

async function getPantry(userId: string) {
  const { data } = await getServerClient().from('pantry_items').select('*').eq('user_id', userId)
  return data || []
}

async function getTodayLog(userId: string) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await getServerClient()
    .from('daily_logs').select('*').eq('user_id', userId).eq('log_date', today).single()
  return data
}

async function getConversationHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await getServerClient()
    .from('conversation_history')
    .select('role, content')
    .eq('user_id', userId)
    .eq('chat_date', today)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data || []) as ChatMessage[]
}

async function saveConversationMessage(userId: string, role: 'user' | 'assistant', content: string) {
  const today = new Date().toISOString().split('T')[0]
  await getServerClient().from('conversation_history').insert({ user_id: userId, chat_date: today, role, content })
}

// ============================================================
// Main dispatcher — everything after the user is identified and
// onboarded. Returns true if the event was handled.
// ============================================================
export async function handleBotEvent(
  ctx: BotChannel,
  user: Record<string, unknown>,
  event: BotEvent
): Promise<void> {
  const db = getServerClient()
  const { callbackData, photoId } = event
  // Natural-language command aliases — WhatsApp users won't type slash commands.
  const lower = event.text.trim().toLowerCase()
  const ALIASES: Record<string, string> = {
    plan: '/plan', today: '/today', stats: '/stats', help: '/help', menu: '/help',
    calendar: '/calendar', groceries: '/groceries', order: '/groceries', mode: '/mode',
    'send my plan': '/plan', // quick-reply button on the win-back template
  }
  const messageText = ALIASES[lower] || event.text.trim()

  // First contact of the day → lead with the consolidated day plan, then handle
  // whatever they actually sent. Pull-based, so it costs nothing on WhatsApp.
  if (!callbackData && messageText !== '/plan') {
    const today = new Date().toISOString().split('T')[0]
    const { data: anyToday } = await db
      .from('conversation_history')
      .select('id')
      .eq('user_id', user.id)
      .eq('chat_date', today)
      .limit(1)
      .maybeSingle()
    if (!anyToday) {
      const plan = await getActivePlan(user.id as string)
      if (plan) {
        await ctx.send(`☀️ Good morning${user.name ? `, ${(user.name as string).split(' ')[0]}` : ''}! Here's your day first 👇`)
        await sendTodayPlan(ctx, plan, user)
        // Record it so commands (which don't write chat history) can't retrigger this.
        await saveConversationMessage(user.id as string, 'assistant', "Sent today's full meal plan.")
      }
    }
  }

  // ---- Callbacks (button taps) ----

  if (callbackData.startsWith('mode:')) {
    const newMode = callbackData.split(':')[1] as 'full' | 'summary'
    await db.from('users').update({ messaging_mode: newMode }).eq('id', user.id)
    const label = newMode === 'summary' ? 'Summary (2 messages/day)' : 'Full (10+ messages/day)'
    await ctx.send(`✅ Switched to *${label}* mode.\n\nThis will take effect from tomorrow's schedule.`)
    return
  }

  if (callbackData.startsWith('swap:')) {
    const parts = callbackData.split(':')
    const slot = parts[1]
    const altIndex = parseInt(parts[2], 10)
    const plan = await getActivePlan(user.id as string)
    if (!plan) return

    const pendingState = (user.onboarding_state as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined
    const alternatives = pendingState?.swap_alternatives as Array<Record<string, unknown>> | undefined
    if (!alternatives || !alternatives[altIndex]) {
      await ctx.send(`Sorry, I lost track of those alternatives. Send /swap ${slot} again.`)
      return
    }

    const chosen = alternatives[altIndex]
    const planData = plan.plan_data as { days?: Array<Record<string, unknown>> }
    const dayIndex = new Date().getDay()
    const days = [...(planData.days || [])]
    const todayDay = { ...(days[dayIndex] as Record<string, unknown>) }
    const slots = normalizeMealSlots(todayDay.slots)
    const slotIdx = slots.findIndex(s => s.slot === slot)
    if (slotIdx !== -1) {
      slots[slotIdx] = {
        ...slots[slotIdx],
        raw: {
          ...slots[slotIdx].raw,
          meal: chosen.meal, kcal: chosen.kcal, protein_g: chosen.protein_g,
          carbs_g: chosen.carbs_g, fat_g: chosen.fat_g,
        },
        meal: String(chosen.meal || slots[slotIdx].meal),
        kcal: Number(chosen.kcal || 0),
        protein_g: Number(chosen.protein_g || 0),
        carbs_g: Number(chosen.carbs_g || 0),
        fat_g: Number(chosen.fat_g || 0),
      }
    }
    todayDay.slots = slots.map(s => s.raw)
    days[dayIndex] = todayDay

    await db.from('meal_plans').update({ plan_data: { ...planData, days } }).eq('id', plan.id)
    await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', user.id)
    await ctx.send(`✅ ${slot.replace(/_/g, ' ')} updated to *${chosen.meal}* (${chosen.kcal} kcal)`)
    return
  }

  if (callbackData.startsWith('confirm:')) {
    const [, slot, action] = callbackData.split(':')
    if (action === 'yes') {
      const pantryResult = await logMealConfirmed(db, user, slot)
      await sendMealLoggedResponse(ctx, pantryResult)
    } else if (action === 'skip') {
      await ctx.sendButtons(`Understood — did you eat something else or nothing?`, [[
        { text: 'Nothing', data: `skipnothing:${slot}` },
        { text: 'Had something else', data: `confirm:${slot}:other` },
      ]])
    } else if (action === 'other') {
      await db.from('users').update({
        onboarding_state: { step: 'waiting_meal_desc', data: { slot } },
      }).eq('id', user.id)
      await ctx.send(`What did you have? Just type the dish name.`)
    }
    return
  }

  if (callbackData.startsWith('photolog:')) {
    const action = callbackData.split(':')[1]
    const estimate = ((user.onboarding_state as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.photo_estimate as Record<string, unknown> | undefined
    if (!estimate) {
      await ctx.send(`I lost track of that photo — send it again and I'll re-analyse it.`)
      return
    }

    if (action === 'yes') {
      await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', user.id)
      const pantryResult = await logPhotoMeal(db, user, estimate)
      const kcal = Number(estimate.kcal) || 0
      const protein = Number(estimate.protein_g) || 0
      let reply = `✅ Logged *${estimate.dish}* — ${kcal} kcal · ${protein}g protein.`
      if (pantryResult?.lowOrOut.length) reply += `\n\nRunning low: *${pantryResult.lowOrOut.slice(0, 3).join(', ')}*`
      await ctx.send(reply)
    } else if (action === 'edit') {
      const slot = (estimate.slot as string) || 'snack'
      await db.from('users').update({
        onboarding_state: { step: 'waiting_meal_desc', data: { slot } },
      }).eq('id', user.id)
      await ctx.send(`What was it? Type the dish and rough portions (e.g. "2 rotis with chole, small bowl").`)
    } else {
      await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', user.id)
      await ctx.send(`No problem — not logged.`)
    }
    return
  }

  if (callbackData.startsWith('skipnothing:')) {
    const slot = callbackData.split(':')[1]
    await logMealSkipped(db, user, slot)
    await ctx.send(`Noted — logged as skipped.`)
    return
  }

  if (callbackData.startsWith('pantry:')) {
    const [, action, itemName] = callbackData.split(':')
    if (['add', 'buy'].includes(action)) {
      await addItemToShoppingList(db, user.id as string, itemName)
      await ctx.send(`Added ${itemName} to your shopping list.`)
    } else {
      await ctx.send(`Got it!`)
    }
    return
  }

  // ---- Stateful text (user is answering a question we asked) ----

  const state = user.onboarding_state as { step?: unknown; data?: Record<string, unknown> } | undefined
  if (state?.step === 'waiting_meal_desc' && messageText && !photoId) {
    const slot = (state.data?.slot as string) || 'snack'
    await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', user.id)
    await ctx.typing()
    await handleSubstitutedMeal(ctx, user, slot, messageText)
    return
  }

  // ---- Photo of a meal ----

  if (photoId) {
    await handleMealPhoto(ctx, db, user, photoId)
    return
  }

  // ---- Commands ----

  if (messageText === '/calendar') {
    await ctx.send(
      `📅 *Your meal plan as a calendar*\n\n` +
      `Every meal in Google or Apple Calendar with reminders — updates automatically when your plan changes.\n\n` +
      `One tap to add it:\n👉 ${process.env.APP_URL}/cal/${user.id}`
    )
    return
  }

  if (messageText === '/plan') {
    let plan = await getActivePlan(user.id as string)
    if (!plan) {
      await ctx.send(`No meal plan yet — generating one now... ⏳`)
      const res = await fetch(`${process.env.APP_URL}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => null)
      if (res?.ok) plan = await getActivePlan(user.id as string)
    }
    if (!plan) {
      await ctx.send(`Plan generation failed. Try /plan again in a moment.`)
      return
    }
    await sendTodayPlan(ctx, plan, user)
    return
  }

  if (messageText === '/today') {
    const [plan, todayLog] = await Promise.all([getActivePlan(user.id as string), getTodayLog(user.id as string)])
    if (!plan) {
      await ctx.send(`No meal plan found. Send /plan to generate one.`)
      return
    }
    await sendTodayProgress(ctx, plan, user, todayLog)
    return
  }

  if (messageText === '/stats') {
    await sendWeeklyStats(ctx, user)
    return
  }

  if (messageText === '/groceries' || /\b(order|buy)\b.*\bgroc|\bgroc.*\b(order|buy)\b/i.test(messageText)) {
    await ctx.typing()
    const res = await fetch(`${process.env.APP_URL}/api/swiggy/cart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => null)
    if (!res) {
      await ctx.send(`Couldn't reach Swiggy right now. Try /groceries again in a moment.`)
      return
    }
    const data = await res.json()

    if (data.linked === false && data.linkUrl) {
      await ctx.send(
        `To order groceries I need to connect your Swiggy account (one-time, ~30 sec — phone + OTP):\n\n👉 ${data.linkUrl}\n\nOnce you're done, send /groceries again and I'll build your cart.`)
      return
    }
    if (data.error && !data.cart) {
      await ctx.send(data.error)
      return
    }

    const cart = data.cart
    let msg = `🛒 *Your Instamart cart*`
    if (data.address?.addressTag) msg += ` — delivering to *${data.address.addressTag}*`
    msg += `\n\n`
    for (const it of cart.items || []) msg += `• ${it.itemName} × ${it.quantity} — ₹${it.discountedFinalPrice}\n`
    const toPay = cart.billBreakdown?.toPay
    msg += `\n*${toPay?.label || 'To Pay'}: ${toPay?.value || cart.cartTotalAmount}*\n`
    if (data.unmatched?.length) msg += `\n⚠️ Couldn't find on Instamart: ${data.unmatched.slice(0, 8).join(', ')}\n`
    if (data.skipped?.length) msg += `\n_Skipped pantry staples: ${data.skipped.slice(0, 6).join(', ')}${data.skipped.length > 6 ? '…' : ''}_\n`
    msg += `\nReview and place the order yourself in Swiggy — I never order or pay for you:\n👉 https://www.swiggy.com/instamart`
    await ctx.send(msg)
    return
  }

  if (messageText === '/help') {
    await sendHelpMessage(ctx, user)
    return
  }

  if (messageText === '/mode') {
    const currentMode = (user.messaging_mode as string) || 'full'
    const isSummary = currentMode === 'summary' || currentMode === 'minimal'
    const modeLabel = isSummary ? 'Summary (2 messages/day)' : 'Full (10+ messages/day)'
    const switchTo = isSummary ? 'full' : 'summary'
    const switchLabel = isSummary ? 'Switch to Full' : 'Switch to Summary'
    await ctx.sendButtons(
      `*Messaging mode*\n\nCurrent: *${modeLabel}*\n\n_Full — wake check + meal reminders + check-ins + evening recap_\n_Summary — one morning briefing + one end-of-day summary_`,
      [[{ text: switchLabel, data: `mode:${switchTo}` }]]
    )
    return
  }

  if (['fewer messages', 'summary only', '/summary'].includes(lower)) {
    await db.from('users').update({ messaging_mode: 'summary' }).eq('id', user.id)
    await ctx.send(
      `Got it. I'll only message you in the morning with your day plan and at night with a summary.\n\nText "full check-ins" anytime to switch back.`)
    return
  }
  if (['full check-ins', 'all messages', '/full'].includes(lower)) {
    await db.from('users').update({ messaging_mode: 'full' }).eq('id', user.id)
    await ctx.send(
      `Back to full check-ins — I'll remind you before and after each meal.\n\nText "fewer messages" anytime if it's too much.`)
    return
  }

  if (messageText.startsWith('/swap') || /\b(swap|change)\s+my\s+\w+/i.test(messageText)) {
    const plan = await getActivePlan(user.id as string)
    if (!plan) {
      await ctx.send(`No meal plan found. Send /plan first.`)
      return
    }
    await handleSwapRequest(ctx, user, plan, messageText)
    return
  }

  // ---- Free-form chat → AI coach ----

  await ctx.typing()
  const [plan, pantry, todayLog, history] = await Promise.all([
    getActivePlan(user.id as string),
    getPantry(user.id as string),
    getTodayLog(user.id as string),
    getConversationHistory(user.id as string, 20),
  ])

  await saveConversationMessage(user.id as string, 'user', messageText)

  const systemPrompt = await buildSystemPrompt(user, plan, pantry, todayLog)
  const reply = history.length > 0
    ? await generateChatWithHistory(systemPrompt, history, messageText)
    : await generateChatContent(systemPrompt, messageText)

  await saveConversationMessage(user.id as string, 'assistant', reply)
  await ctx.send(reply)
}

// ============================================================
// Welcome — shared by both channels after account linking.
// Includes the two anti-burial moves: pin-the-chat and the
// one-tap calendar link (reminders that live outside chat).
// ============================================================
export async function sendWelcomeWithPlan(ctx: BotChannel, user: Record<string, unknown>) {
  const isSummary = ['summary', 'minimal'].includes((user.messaging_mode as string) || '')
  const scheduleText = isSummary
    ? `☀️ One morning briefing + 🌙 one end-of-day summary`
    : `☀️ Wake check → meal reminders → check-ins → 🌙 evening recap`

  const welcomeText =
    `🎉 Welcome${user.name ? `, ${user.name}` : ''}! I'm *Kanshi*, your AI nutrition coach.\n\n` +
    `Two quick things that make this work:\n\n` +
    `📌 *Pin this chat* (long-press → Pin) so I never get buried under other messages.\n\n` +
    `🗓 *Add your meals to your calendar* — one tap, reminders come from your calendar app even if you miss my messages:\n${process.env.APP_URL}/cal/${user.id}\n\n` +
    `What I can do:\n` +
    `📸 Send me a *photo of any meal* — I'll identify and log it\n` +
    `📅 /plan — Today's meals with macros\n` +
    `🕐 /today — What's left today + progress\n` +
    `📊 /stats — Weekly summary & streak\n` +
    `🔄 /swap [meal] — Get an alternative\n` +
    `🛒 /groceries — Build an Instamart cart from your list\n` +
    `❓ /help — All commands\n\n` +
    `Every day:\n${scheduleText}\n\n` +
    `Here's today 👇`

  await ctx.send(welcomeText)

  if (user.id) {
    const plan = await getActivePlan(user.id as string)
    if (plan) {
      await sendTodayPlan(ctx, plan, user)
    } else {
      await ctx.send(`No meal plan generated yet. Send */plan* to generate one.`)
    }
  }
}

// ============================================================
// Ported handlers (channel-agnostic)
// ============================================================

async function sendTodayPlan(ctx: BotChannel, plan: Record<string, unknown>, user: Record<string, unknown>) {
  const today = new Date()
  const dayIndex = today.getDay()
  const dayName = DAY_NAMES[dayIndex]
  const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1)

  const workoutDays = (user.workout_days as string[]) || []
  const isWorkoutDay = workoutDays.includes(dayName)

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined

  if (!todayPlan) {
    await ctx.send(`No plan found for ${dayLabel}. Try /plan again in a minute.`)
    return
  }

  const slots = normalizeMealSlots(todayPlan.slots || todayPlan.meals)
  if (!slots || slots.length === 0) {
    await ctx.send(`Today's plan looks empty. Send /plan again to retry.`)
    return
  }

  let msg = `📅 *Today's Plan* — ${dayLabel}${isWorkoutDay ? ' 💪' : ''}\n\n`

  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0
  for (const slot of slots) {
    const label = SLOT_EMOJI[slot.slot] || `🍽️ ${slot.slot.replace(/_/g, ' ')}`
    totalKcal += slot.kcal
    totalProtein += slot.protein_g
    totalCarbs += slot.carbs_g
    totalFat += slot.fat_g

    const timePrefix = slot.time ? `${slot.time} ` : ''
    msg += `${timePrefix}*${label}*\n${slot.meal}`
    if (slot.kcal > 0) {
      let macroStr = `${slot.kcal} kcal`
      if (slot.protein_g > 0) macroStr += ` | ${slot.protein_g}g protein`
      msg += ` _(${macroStr})_`
    }
    msg += '\n\n'
  }

  msg += `Total: ${totalKcal} kcal | ${totalProtein}g protein | ${totalCarbs}g carbs | ${totalFat}g fat`

  await ctx.send(msg)
}

async function sendTodayProgress(ctx: BotChannel, plan: Record<string, unknown>, user: Record<string, unknown>, todayLog: Record<string, unknown> | null) {
  const today = new Date()
  const dayIndex = today.getDay()
  const workoutDays = (user.workout_days as string[]) || []
  const isWorkoutDay = workoutDays.includes(DAY_NAMES[dayIndex])
  const targetKcal = (user.target_kcal as number) || 2000
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal
  const targetProtein = (user.target_protein_g as number) || 0

  const loggedKcal = (todayLog?.total_kcal as number) || 0
  const loggedProtein = (todayLog?.total_protein_g as number) || 0
  const mealsEaten = (todayLog?.meals_eaten as Array<Record<string, unknown>>) || []
  const mealsSkipped = (todayLog?.meals_skipped as string[]) || []
  const mealsSubstituted = (todayLog?.meals_substituted as Array<Record<string, unknown>>) || []
  const loggedSlots = new Set([
    ...mealsEaten.map(m => m.slot as string),
    ...mealsSkipped,
    ...mealsSubstituted.map(m => m.slot as string),
  ])

  const pct = dayKcal > 0 ? Math.round((loggedKcal / dayKcal) * 100) : 0

  let msg = `🕐 *Today so far*\n\n`
  msg += `✅ Logged: ${loggedKcal} kcal / ${dayKcal} kcal (${pct}%)\n`
  msg += `Protein: ${loggedProtein}g / ${targetProtein}g\n\n`

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined
  const slots = normalizeMealSlots(todayPlan?.slots || todayPlan?.meals)

  if (slots && slots.length > 0) {
    const remaining = slots.filter(s => !loggedSlots.has(s.slot))
    if (remaining.length > 0) {
      msg += `Remaining meals:\n`
      for (const slot of remaining) {
        const timeStr = slot.time ? ` (${slot.time})` : ''
        msg += `• ${slot.slot.replace(/_/g, ' ')}${timeStr} — ${slot.meal}\n`
      }
    } else {
      msg += `All meals logged for today! 🎉`
    }
  }

  await ctx.send(msg)
}

async function sendWeeklyStats(ctx: BotChannel, user: Record<string, unknown>) {
  const db = getServerClient()
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 6)
  const fromDate = sevenDaysAgo.toISOString().split('T')[0]
  const toDate = today.toISOString().split('T')[0]

  const { data: logs } = await db
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('log_date', fromDate)
    .lte('log_date', toDate)

  const streak = (user.current_streak as number) || 0
  const targetKcal = (user.target_kcal as number) || 2000
  const targetProtein = (user.target_protein_g as number) || 0

  const daysLogged = logs?.length || 0
  const avgKcal = daysLogged > 0
    ? Math.round((logs || []).reduce((sum, l) => sum + (l.total_kcal || 0), 0) / daysLogged)
    : 0
  const avgProtein = daysLogged > 0
    ? Math.round((logs || []).reduce((sum, l) => sum + (l.total_protein_g || 0), 0) / daysLogged)
    : 0

  let msg = `📊 *Your week*\n\n`
  msg += `🔥 Streak: ${streak} days\n`
  msg += `📅 This week: ${daysLogged}/7 days logged\n`
  msg += `🎯 Avg calories: ${avgKcal} / ${targetKcal} kcal\n`
  msg += `💪 Avg protein: ${avgProtein}g / ${targetProtein}g\n\n`
  msg += `Keep it up! 💪`

  await ctx.send(msg)
}

async function sendHelpMessage(ctx: BotChannel, user: Record<string, unknown>) {
  const isSummary = ['summary', 'minimal'].includes((user.messaging_mode as string) || '')
  const scheduleText = isSummary
    ? `☀️ One morning briefing + 🌙 one end-of-day summary`
    : `☀️ Wake check → meal reminders → check-ins → 🌙 evening recap`

  const msg =
    `Here's how to use me:\n\n` +
    `📸 *Send a photo of your meal* — I'll identify it, estimate calories, and log it\n\n` +
    `📅 /plan — Today's full meal schedule with macros\n` +
    `🕐 /today — What's left for the day + progress so far\n` +
    `📊 /stats — Weekly summary, streak & adherence\n` +
    `🔄 /swap [meal] — e.g. "swap my dinner" to get an alternative\n` +
    `🛒 /groceries — Build an Instamart cart from your shopping list\n` +
    `🗓 /calendar — Get your meals in Google/Apple Calendar\n` +
    `🥗 /pantry — View & update your pantry\n` +
    `🔔 /mode — Toggle full vs summary messaging\n` +
    `❓ /help — Show this message again\n\n` +
    `Every day you'll get:\n${scheduleText}`

  await ctx.send(msg)
}

async function handleSwapRequest(ctx: BotChannel, user: Record<string, unknown>, plan: Record<string, unknown>, messageText: string) {
  const db = getServerClient()
  const slotMatch = messageText.match(/\b(early_morning|breakfast|mid_morning|lunch|evening_snack|dinner|pre_bed|morning|snack|evening)\b/i)
  let slotName = slotMatch?.[1]?.toLowerCase() || ''
  const aliasMap: Record<string, string> = { morning: 'breakfast', snack: 'evening_snack', evening: 'dinner' }
  if (aliasMap[slotName]) slotName = aliasMap[slotName]

  const dayIndex = new Date().getDay()
  const planData = plan.plan_data as { days?: Array<Record<string, unknown>> }
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined
  const slots = normalizeMealSlots(todayPlan?.slots || todayPlan?.meals)

  if (!slotName || !slots) {
    await ctx.send(`Which meal do you want to swap? Try:\n/swap breakfast\n/swap lunch\n/swap dinner\n/swap evening_snack`)
    return
  }

  const currentSlot = slots.find(s => s.slot === slotName)
  if (!currentSlot) {
    await ctx.send(`Couldn't find *${slotName}* in today's plan. Available: ${slots.map(s => s.slot).join(', ')}`)
    return
  }

  await ctx.typing()

  const goal = (user.goal as string) || 'healthy eating'
  const restrictions: string[] = []
  if (!user.okay_with_dairy) restrictions.push('no dairy')
  if (!user.okay_with_eggs) restrictions.push('no eggs')
  if (!user.okay_with_meat_fish) restrictions.push('no meat or fish')
  if ((user.allergies as string[])?.length) restrictions.push(`allergic to: ${(user.allergies as string[]).join(', ')}`)

  const prompt = `User wants to swap ${currentSlot.meal || slotName} for ${slotName} on their ${goal} diet. Suggest 2 alternative Indian meals with similar calories (around ${currentSlot.kcal || 300} kcal) and macros. User restrictions: ${restrictions.join(', ') || 'none'}. Return JSON only: {"alternatives": [{"meal": "string", "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "reason": "string"}]}`

  let alternatives: Array<{ meal: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; reason: string }> = []
  try {
    const raw = await generateChatContent('You are a nutrition expert. Return only valid JSON, no markdown.', prompt)
    const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    alternatives = parsed.alternatives || []
  } catch {
    await ctx.send(`Couldn't generate alternatives right now. Try again in a moment.`)
    return
  }

  if (!alternatives.length) {
    await ctx.send(`No alternatives found. Try again in a moment.`)
    return
  }

  await db.from('users').update({
    onboarding_state: { step: 'waiting_swap', data: { swap_alternatives: alternatives, swap_slot: slotName } },
  }).eq('id', user.id)

  const msgText = `🔄 *Swap ${slotName.replace(/_/g, ' ')}*\n\nCurrent: ${currentSlot.meal || slotName}\n\n` +
    alternatives.map((alt, i) => `*${i + 1}.* ${alt.meal} (${alt.kcal} kcal) — ${alt.reason}`).join('\n') +
    `\n\nChoose an alternative:`
  const keyboard = alternatives.map((alt, i) => [
    { text: `Option ${i + 1}`, data: `swap:${slotName}:${i}` },
  ])

  await ctx.sendButtons(msgText, keyboard)
}

// Download a meal photo, run Gemini vision on it with today's plan as
// context, and ask the user to confirm before anything is logged.
async function handleMealPhoto(
  ctx: BotChannel,
  db: ReturnType<typeof getServerClient>,
  user: Record<string, unknown>,
  photoId: string
) {
  await ctx.typing()

  let photo: { base64: string; mime: string }
  try {
    photo = await ctx.downloadPhoto(photoId)
  } catch (e) {
    console.error('[photo] download failed:', e)
    await ctx.send(`Couldn't download that photo — try sending it again.`)
    return
  }

  // Which meal slot is this most likely to be? Use IST time against today's plan.
  const plan = await getActivePlan(user.id as string)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const nowMin = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes()
  const dayIndex = new Date(`${istDateString()}T00:00:00Z`).getUTCDay()
  const slots = plan ? getDaySlots(plan.plan_data, dayIndex) : []

  let nearest: { slot: string; meal: string; kcal: number } | null = null
  let bestDist = 150 // only match a slot within ±2.5 hours
  for (const s of slots) {
    if (!/^\d{1,2}:\d{2}$/.test(s.time)) continue
    const [h, m] = s.time.split(':').map(Number)
    const dist = Math.abs(h * 60 + m - nowMin)
    if (dist < bestDist) {
      bestDist = dist
      nearest = { slot: s.slot, meal: s.meal, kcal: s.kcal }
    }
  }

  let estimate
  try {
    estimate = await analyzeMealPhoto(photo.base64, photo.mime, {
      plannedMeal: nearest?.meal,
      plannedKcal: nearest?.kcal,
      slotLabel: nearest ? slotLabel(nearest.slot) : undefined,
    })
  } catch (e) {
    console.error('[photo] analysis failed:', e)
    await ctx.send(`Couldn't make out the meal from that photo. Try better lighting, or just type what you ate.`)
    return
  }

  // Park the estimate so the confirm button can pick it up (callback payloads
  // are size-limited, so the estimate can't travel through the button itself).
  const pending = { ...estimate, slot: estimate.matches_planned && nearest ? nearest.slot : null }
  await db.from('users').update({
    onboarding_state: { step: 'photo_pending', data: { photo_estimate: pending } },
  }).eq('id', user.id)

  const slotText = pending.slot ? ` as *${slotLabel(pending.slot)}*` : ''
  const unsure = estimate.confidence === 'low' ? `\n\n_I'm not fully sure from this photo — correct me if needed._` : ''
  await ctx.sendButtons(
    `📸 Looks like *${estimate.dish}*\n~${estimate.kcal} kcal · ${estimate.protein_g}g P · ${estimate.carbs_g}g C · ${estimate.fat_g}g F${unsure}\n\n${estimate.comment}\n\nLog it${slotText}?`,
    [[
      { text: '✅ Log it', data: 'photolog:yes' },
      { text: '✏️ Not quite', data: 'photolog:edit' },
      { text: "❌ Don't log", data: 'photolog:no' },
    ]]
  )
}

async function logMealConfirmed(
  db: ReturnType<typeof getServerClient>,
  user: Record<string, unknown>,
  slot: string
): Promise<PantryConsumptionResult | null> {
  const today = new Date().toISOString().split('T')[0]
  const plan = await getActivePlan(user.id as string)
  const dayIndex = new Date().getDay()
  const slotData = getDaySlot(plan?.plan_data, dayIndex, slot)

  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const existing = (log?.meals_eaten as Array<Record<string, unknown>>) || []
  if (existing.some(meal => meal.slot === slot)) return null

  const meals_eaten = [...existing, {
    slot,
    name: slotData?.meal || slot,
    kcal: Number(slotData?.kcal || 0),
    protein_g: Number(slotData?.protein_g || 0),
    carbs_g: Number(slotData?.carbs_g || 0),
    fat_g: Number(slotData?.fat_g || 0),
    logged_at: new Date().toISOString(),
  }]
  const typed = meals_eaten as Array<Record<string, number>>
  const total_kcal = typed.reduce((sum, m) => sum + (m.kcal || 0), 0)
  const total_protein_g = typed.reduce((sum, m) => sum + (m.protein_g || 0), 0)
  const total_carbs_g = typed.reduce((sum, m) => sum + (m.carbs_g || 0), 0)
  const total_fat_g = typed.reduce((sum, m) => sum + (m.fat_g || 0), 0)

  await db.from('daily_logs').upsert({
    user_id: user.id,
    log_date: today,
    meals_eaten,
    total_kcal,
    total_protein_g,
    total_carbs_g,
    total_fat_g,
  }, { onConflict: 'user_id,log_date' })

  if (!plan?.plan_data) return null
  return consumePantryForMeal(db, user.id as string, plan.plan_data, dayIndex, slot)
}

async function logMealSkipped(db: ReturnType<typeof getServerClient>, user: Record<string, unknown>, slot: string) {
  const today = new Date().toISOString().split('T')[0]
  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const meals_skipped = [...((log?.meals_skipped as string[]) || []), slot]
  if ((log?.meals_skipped as string[] | undefined)?.includes(slot)) return
  await db.from('daily_logs').upsert({ user_id: user.id, log_date: today, meals_skipped }, { onConflict: 'user_id,log_date' })
}

// Log a photo-confirmed meal into daily_logs. Totals are recomputed from both
// eaten and substituted meals so nothing double-counts or goes missing.
async function logPhotoMeal(
  db: ReturnType<typeof getServerClient>,
  user: Record<string, unknown>,
  estimate: Record<string, unknown>
): Promise<PantryConsumptionResult | null> {
  const today = new Date().toISOString().split('T')[0]
  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const existing = (log?.meals_eaten as Array<Record<string, unknown>>) || []

  // If the matched slot is already logged, record it as an extra rather than dropping it.
  let slot = (estimate.slot as string) || 'snack'
  if (existing.some(meal => meal.slot === slot)) slot = 'extra'

  const meals_eaten = [...existing, {
    slot,
    name: estimate.dish,
    kcal: Number(estimate.kcal) || 0,
    protein_g: Number(estimate.protein_g) || 0,
    carbs_g: Number(estimate.carbs_g) || 0,
    fat_g: Number(estimate.fat_g) || 0,
    logged_at: new Date().toISOString(),
    via: 'photo',
  }]

  const substituted = (log?.meals_substituted as Array<Record<string, unknown>>) || []
  const all = [...meals_eaten, ...substituted] as Array<Record<string, number>>
  const total_kcal = all.reduce((sum, m) => sum + (Number(m.kcal) || 0), 0)
  const total_protein_g = all.reduce((sum, m) => sum + (Number(m.protein_g) || 0), 0)
  const total_carbs_g = all.reduce((sum, m) => sum + (Number(m.carbs_g) || 0), 0)
  const total_fat_g = all.reduce((sum, m) => sum + (Number(m.fat_g) || 0), 0)

  await db.from('daily_logs').upsert({
    user_id: user.id,
    log_date: today,
    meals_eaten,
    total_kcal,
    total_protein_g,
    total_carbs_g,
    total_fat_g,
  }, { onConflict: 'user_id,log_date' })

  // Only consume pantry stock when the photo matched the planned meal —
  // an off-plan meal doesn't use the plan's ingredients.
  if (estimate.matches_planned && estimate.slot) {
    const plan = await getActivePlan(user.id as string)
    if (plan?.plan_data) {
      const dayIndex = new Date(`${istDateString()}T00:00:00Z`).getUTCDay()
      return consumePantryForMeal(db, user.id as string, plan.plan_data, dayIndex, estimate.slot as string)
    }
  }
  return null
}

async function sendMealLoggedResponse(ctx: BotChannel, pantryResult: PantryConsumptionResult | null) {
  if (!pantryResult) {
    await ctx.send(`Already logged this meal.`)
    return
  }

  if (!pantryResult.lowOrOut.length) {
    await ctx.send(`✅ Logged! Keep it up 🔒`)
    return
  }

  const items = pantryResult.lowOrOut.slice(0, 3)
  await ctx.send(`✅ Logged! Pantry updated.\n\nRunning low or missing: *${items.join(', ')}*`)

  for (const item of items) {
    await ctx.sendButtons(`${item} may need restocking. Add it to your shopping list?`, pantryAlertButtons(item))
  }
}

async function addItemToShoppingList(
  db: ReturnType<typeof getServerClient>,
  userId: string,
  itemName: string
) {
  const { data: list } = await db
    .from('shopping_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (list && !list.ordered) {
    const items = [...((list.items as Array<Record<string, unknown>>) || [])]
    if (!items.some(i => String(i.name).toLowerCase() === itemName.toLowerCase())) {
      items.push({ name: itemName, qty: 1, unit: 'unit', checked: false, in_pantry: false })
      await db.from('shopping_lists').update({ items }).eq('id', list.id)
    }
  } else {
    await db.from('shopping_lists').insert({
      user_id: userId,
      items: [{ name: itemName, qty: 1, unit: 'unit', checked: false, in_pantry: false }],
      ordered: false,
      order_source: 'telegram',
    })
  }
}

async function handleSubstitutedMeal(ctx: BotChannel, user: Record<string, unknown>, slot: string, dishName: string) {
  const plan = await getActivePlan(user.id as string)
  const dayIndex = new Date().getDay()
  const planned = getDaySlot(plan?.plan_data, dayIndex, slot)

  const prompt = `The user was supposed to eat: ${planned?.meal || slot}.\nThey actually ate: ${dishName}.\nEstimate the macros (kcal, protein_g, carbs_g, fat_g).\nEstimate key ingredients (name, approximate grams).\nReturn JSON: { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "ingredients": [{"name":"","grams":0}], "comment": "brief suggestion" }`

  let estimated: Record<string, unknown> = {}
  try {
    const text = await generateChatContent('', prompt)
    estimated = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch { /* ignore */ }

  const today = new Date().toISOString().split('T')[0]
  const db = getServerClient()
  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const meals_substituted = [...((log?.meals_substituted as unknown[]) || []), {
    slot, original: planned?.meal || slot, actual: dishName, ...estimated, logged_at: new Date().toISOString(),
  }]
  const total_kcal = ((log?.total_kcal as number) || 0) + (estimated.kcal as number || 0)
  const total_protein_g = ((log?.total_protein_g as number) || 0) + (estimated.protein_g as number || 0)
  await db.from('daily_logs').upsert({ user_id: user.id, log_date: today, meals_substituted, total_kcal, total_protein_g }, { onConflict: 'user_id,log_date' })

  const comment = estimated.comment as string || ''
  await ctx.send(`${dishName} — roughly *${estimated.kcal || '?'} kcal*, ${estimated.protein_g || '?'}g protein.\n\n${comment}`)
}

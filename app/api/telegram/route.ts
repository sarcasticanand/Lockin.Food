import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { buildSystemPrompt, getFeatureFlags } from '@/lib/prompt-builder'
import { generateChatContent, generateChatWithHistory, type ChatMessage } from "@/lib/gemini"
import { sendMessage, sendTyping, sendButtons, answerCallbackQuery, mealConfirmButtons, pantryAlertButtons } from '@/lib/telegram-helpers'
import { getDaySlot, normalizeMealSlots } from '@/lib/meal-slots'
import { consumePantryForMeal, type PantryConsumptionResult } from '@/lib/pantry-consumption'

async function getUser(chatId: number) {
  const { data } = await getServerClient()
    .from('users')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single();
  return data;
}

async function getActivePlan(userId: string) {
  const { data } = await getServerClient()
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getPantry(userId: string) {
  const { data } = await getServerClient()
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId);
  return data || [];
}

async function getTodayLog(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await getServerClient()
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', today)
    .single();
  return data;
}

async function getConversationHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await getServerClient()
    .from('conversation_history')
    .select('role, content')
    .eq('user_id', userId)
    .eq('chat_date', today)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data || []) as ChatMessage[];
}

async function saveConversationMessage(userId: string, role: 'user' | 'assistant', content: string) {
  const today = new Date().toISOString().split('T')[0];
  await getServerClient().from('conversation_history').insert({ user_id: userId, chat_date: today, role, content });
}

const SLOT_LABELS: Record<string, string> = {
  early_morning: '🌅 Early Morning',
  breakfast: '🍳 Breakfast',
  mid_morning: '🍎 Mid-Morning',
  lunch: '🍱 Lunch',
  evening_snack: '☕ Evening Snack',
  dinner: '🌙 Dinner',
  pre_bed: '🌛 Pre-Bed',
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function sendTodayPlan(chatId: number, plan: Record<string, unknown>, user: Record<string, unknown>) {
  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = DAY_NAMES[dayIndex];
  const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const workoutDays = (user.workout_days as string[]) || [];
  const isWorkoutDay = workoutDays.includes(dayName);
  const targetKcal = (user.target_kcal as number) || 2000;
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined;
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;

  if (!todayPlan) {
    await sendMessage(chatId, `No plan found for ${dayLabel}. Your plan may still be generating — try /plan in a minute.`);
    return;
  }

  const slots = normalizeMealSlots(todayPlan.slots || todayPlan.meals);
  if (!slots || slots.length === 0) {
    await sendMessage(chatId, `Today's plan looks empty. Send /plan again to retry.`);
    return;
  }

  let msg = `*📅 ${dayLabel}${isWorkoutDay ? ' 💪 Workout Day' : ''}*\n`;
  msg += `Target: *${dayKcal} kcal* · Protein: *${user.target_protein_g || '—'}g*\n\n`;

  let totalKcal = 0;
  for (const slot of slots) {
    const slotKey = slot.slot;
    const label = SLOT_LABELS[slotKey] || `🍽️ ${slotKey.replace(/_/g, ' ')}`;
    const meal = slot.meal;
    const kcal = slot.kcal;
    const protein = slot.protein_g;
    totalKcal += kcal;

    msg += `*${label}*\n${meal}`;
    if (kcal > 0 || protein > 0) msg += ` _(${kcal} kcal · ${protein}g P)_`;
    msg += '\n\n';
  }

  msg += `📊 Total: ~${totalKcal} kcal\n\n`;
  msg += `💬 _Tap to ask: swap a meal, log what you ate, get a recipe_`;

  await sendMessage(chatId, msg);
}

export async function POST(req: NextRequest) {
  const db = getServerClient()
  try {
    const body = await req.json()
    if (!body.message && !body.callback_query) return NextResponse.json({ ok: true })

    const chatId: number = body.message?.chat?.id ?? body.callback_query?.message?.chat?.id
    const messageText: string = (body.message?.text ?? '').trim()
    const callbackData: string = body.callback_query?.data ?? ''
    const callbackQueryId: string | null = body.callback_query?.id ?? null
    const username: string =
      body.message?.from?.username ??
      body.message?.from?.first_name ??
      body.callback_query?.from?.username ??
      body.callback_query?.from?.first_name ??
      ''

    if (!chatId) return NextResponse.json({ ok: true })
    if (callbackQueryId) await answerCallbackQuery(callbackQueryId)

    if (callbackData.startsWith('mode:')) {
      const newMode = callbackData.split(':')[1] as 'full' | 'summary'
      const cbUser = await getUser(chatId)
      if (cbUser) {
        await db.from('users').update({ messaging_mode: newMode }).eq('id', cbUser.id)
        const label = newMode === 'summary' ? 'Summary (2 messages/day)' : 'Full (10+ messages/day)'
        await sendMessage(chatId, `✅ Switched to *${label}* mode.\n\nThis will take effect from tomorrow's schedule.`)
      }
      return NextResponse.json({ ok: true })
    }

    if (callbackData.startsWith('swap:')) {
      const parts = callbackData.split(':')
      const slot = parts[1]
      const altIndex = parseInt(parts[2], 10)
      const swapUser = await getUser(chatId)
      if (!swapUser) return NextResponse.json({ ok: true })
      const plan = await getActivePlan(swapUser.id)
      if (!plan) return NextResponse.json({ ok: true })

      const pendingState = swapUser.onboarding_state?.data?.swap_alternatives as Array<Record<string, unknown>> | undefined
      if (!pendingState || !pendingState[altIndex]) {
        await sendMessage(chatId, `Sorry, I lost track of those alternatives. Send /swap ${slot} again.`)
        return NextResponse.json({ ok: true })
      }

      const chosen = pendingState[altIndex]
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
            meal: chosen.meal,
            kcal: chosen.kcal,
            protein_g: chosen.protein_g,
            carbs_g: chosen.carbs_g,
            fat_g: chosen.fat_g,
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
      await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', swapUser.id)
      await sendMessage(chatId, `✅ ${slot.replace(/_/g, ' ')} updated to *${chosen.meal}* (${chosen.kcal} kcal)`)
      return NextResponse.json({ ok: true })
    }

    if (callbackData.startsWith('confirm:')) {
      const [, slot, action] = callbackData.split(':')
      const user = await getUser(chatId)
      if (!user) return NextResponse.json({ ok: true })

      if (action === 'yes') {
        const pantryResult = await logMealConfirmed(db, user, slot)
        await sendMealLoggedResponse(chatId, pantryResult)
      } else if (action === 'skip') {
        await sendButtons(chatId, `Understood — did you eat something else or nothing?`, [
          [
            { text: 'Nothing', callback_data: `skipnothing:${slot}` },
            { text: 'Had something else', callback_data: `confirm:${slot}:other` },
          ],
        ])
      } else if (action === 'other') {
        await db.from('users').update({
          onboarding_state: { step: 'waiting_meal_desc', data: { slot } },
        }).eq('id', user.id)
        await sendMessage(chatId, `What did you have? Just type the dish name.`)
      }
      return NextResponse.json({ ok: true })
    }

    if (callbackData.startsWith('skipnothing:')) {
      const slot = callbackData.split(':')[1]
      const user = await getUser(chatId)
      if (user) await logMealSkipped(db, user, slot)
      await sendMessage(chatId, `Noted — logged as skipped.`)
      return NextResponse.json({ ok: true })
    }

    if (callbackData.startsWith('pantry:')) {
      const [, action, itemName] = callbackData.split(':')
      const user = await getUser(chatId)
      if (user && ['add', 'buy'].includes(action)) {
        await addItemToShoppingList(db, user.id as string, itemName)
        await sendMessage(chatId, `Added ${itemName} to your shopping list.`)
      } else {
        await sendMessage(chatId, `Got it!`)
      }
      void pantryAlertButtons
      return NextResponse.json({ ok: true })
    }

    const stateUser = await getUser(chatId)
    if (stateUser?.onboarding_state?.step === 'waiting_meal_desc') {
      const slot = stateUser.onboarding_state.data?.slot as string
      await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', stateUser.id)
      await sendTyping(chatId)
      await handleSubstitutedMeal(chatId, stateUser, slot, messageText)
      return NextResponse.json({ ok: true })
    }

    if (messageText.startsWith('/start')) {
      const token = messageText.slice('/start'.length).trim()

      if (token && token.length === 16 && /^[0-9a-f]+$/i.test(token)) {
        const { data: tokenUser } = await db
          .from('users')
          .select('*')
          .eq('link_token', token)
          .gt('link_token_expires_at', new Date().toISOString())
          .single()

        if (tokenUser) {
          await db.from('users').update({
            telegram_chat_id: chatId,
            telegram_username: username,
            telegram_connected: true,
            link_token: null,
            link_token_expires_at: null,
          }).eq('id', tokenUser.id)
          const linkedUser = { ...tokenUser, telegram_chat_id: chatId, telegram_connected: true }
          await sendWelcomeWithPlan(chatId, linkedUser)
          const { data: linkPlan } = await db.from('meal_plans').select('*').eq('user_id', tokenUser.id).eq('is_active', true).limit(1).single()
          if (linkPlan) {
            const { generateDailySchedule } = await import('@/lib/scheduler')
            await generateDailySchedule(linkedUser, linkPlan)
          }
        } else {
          await sendMessage(chatId, `This link has expired. Go to your dashboard and tap "Connect Telegram" for a new link:\n👉 ${process.env.APP_URL}/dashboard`)
        }
        return NextResponse.json({ ok: true })
      }

      const returningUser = await getUser(chatId)
      if (returningUser?.onboarding_complete) {
        const firstName = (returningUser.name as string)?.split(' ')[0] || ''
        const streak = (returningUser.current_streak as number) || 0
        await sendMessage(chatId,
          `Welcome back${firstName ? ` ${firstName}` : ''}! Day ${streak + 1}. 🔒\n\nSend /plan for today's meals.`
        )
        return NextResponse.json({ ok: true })
      }

      if (!returningUser) {
        await db.from('users').insert({ telegram_chat_id: chatId, telegram_username: username })
      }
      await sendMessage(chatId,
        `Hey${username ? ` @${username}` : ''}! 👋\n\n` +
        `Already signed up on *lockin.food*? Reply with your 10-digit phone number and I'll link your account.\n\n` +
        `_New here? Set up your profile first:_\n👉 ${process.env.APP_URL}/onboarding`
      )
      return NextResponse.json({ ok: true })
    }

    const looksLikePhone = (t: string) => { const n = t.replace(/\D/g, '').slice(-10); return n.length === 10 && /^[6-9]/.test(n) }
    if (looksLikePhone(messageText) && (!stateUser || !stateUser.onboarding_complete)) {
      const normalized = messageText.replace(/\D/g, '').slice(-10)
      const { data: phoneUser } = await db.from('users').select('*').ilike('phone_number', `%${normalized}`).limit(1).maybeSingle()

      if (phoneUser) {
        await db.from('users').update({ telegram_chat_id: chatId, telegram_username: username, telegram_connected: true }).eq('id', phoneUser.id)
        if (stateUser && stateUser.id !== phoneUser.id) await db.from('users').delete().eq('id', stateUser.id)
        await sendWelcomeWithPlan(chatId, { ...phoneUser, telegram_chat_id: chatId, telegram_connected: true })
      } else {
        await sendMessage(chatId, `Couldn't find an account with that number. Make sure you used the same number on *lockin.food*.`)
      }
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/deletedata') {
      await sendMessage(chatId, `This will permanently delete your profile, meal plans, pantry, and all history.\n\nType *DELETE* to confirm.`)
      return NextResponse.json({ ok: true })
    }

    if (messageText === 'DELETE') {
      const user = await getUser(chatId)
      if (user) {
        await Promise.all([
          db.from('conversation_history').delete().eq('user_id', user.id),
          db.from('scheduled_messages').delete().eq('user_id', user.id),
          db.from('shopping_lists').delete().eq('user_id', user.id),
          db.from('pantry_items').delete().eq('user_id', user.id),
          db.from('daily_logs').delete().eq('user_id', user.id),
          db.from('meal_plans').delete().eq('user_id', user.id),
        ])
        await db.from('users').delete().eq('id', user.id)
      }
      await sendMessage(chatId, `All your data has been deleted. Send /start to begin again.`)
      return NextResponse.json({ ok: true })
    }

    const user = await getUser(chatId)
    if (!user || !user.onboarding_complete) {
      await sendMessage(chatId, `Complete your profile first:\n👉 ${process.env.APP_URL}/onboarding`)
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/plan') {
      let plan = await getActivePlan(user.id)
      if (!plan) {
        await sendMessage(chatId, `No meal plan yet — generating one now... ⏳`)
        const res = await fetch(`${process.env.APP_URL}/api/generate-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => null)
        if (res?.ok) plan = await getActivePlan(user.id)
      }
      if (!plan) {
        await sendMessage(chatId, `Plan generation failed. Try /plan again in a moment.`)
        return NextResponse.json({ ok: true })
      }
      await sendTodayPlanImproved(chatId, plan, user)
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/today') {
      const [plan, todayLog] = await Promise.all([getActivePlan(user.id), getTodayLog(user.id)])
      if (!plan) {
        await sendMessage(chatId, `No meal plan found. Send /plan to generate one.`)
        return NextResponse.json({ ok: true })
      }
      await sendTodayProgress(chatId, plan, user, todayLog)
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/stats') {
      await sendWeeklyStats(chatId, user)
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/help') {
      await sendHelpMessage(chatId, user)
      return NextResponse.json({ ok: true })
    }

    if (messageText === '/mode') {
      const currentMode = (user.messaging_mode as string) || 'full'
      const isSummary = currentMode === 'summary' || currentMode === 'minimal'
      const modeLabel = isSummary ? 'Summary (2 messages/day)' : 'Full (10+ messages/day)'
      const switchTo = isSummary ? 'full' : 'summary'
      const switchLabel = isSummary ? 'Switch to Full' : 'Switch to Summary'
      await sendButtons(chatId,
        `*Messaging mode*\n\nCurrent: *${modeLabel}*\n\n_Full — wake check + meal reminders + check-ins + evening recap_\n_Summary — one morning briefing + one end-of-day summary_`,
        [[{ text: switchLabel, callback_data: `mode:${switchTo}` }]]
      )
      return NextResponse.json({ ok: true })
    }

    if (['fewer messages', 'summary only', '/summary'].includes(messageText.toLowerCase())) {
      await db.from('users').update({ messaging_mode: 'summary' }).eq('id', user.id)
      await sendMessage(chatId,
        `Got it. I'll only message you in the morning with your day plan and at night with a summary.\n\nText "full check-ins" anytime to switch back.`)
      return NextResponse.json({ ok: true })
    }
    if (['full check-ins', 'all messages', '/full'].includes(messageText.toLowerCase())) {
      await db.from('users').update({ messaging_mode: 'full' }).eq('id', user.id)
      await sendMessage(chatId,
        `Back to full check-ins — I'll remind you before and after each meal.\n\nText "fewer messages" anytime if it's too much.`)
      return NextResponse.json({ ok: true })
    }

    if (messageText.startsWith('/swap') || /\b(swap|change)\s+my\s+\w+/i.test(messageText)) {
      const plan = await getActivePlan(user.id)
      if (!plan) {
        await sendMessage(chatId, `No meal plan found. Send /plan first.`)
        return NextResponse.json({ ok: true })
      }
      await handleSwapRequest(chatId, user, plan, messageText)
      return NextResponse.json({ ok: true })
    }

    await sendTyping(chatId)
    const [plan, pantry, todayLog, history] = await Promise.all([
      getActivePlan(user.id),
      getPantry(user.id),
      getTodayLog(user.id),
      getConversationHistory(user.id, 20),
    ])
    void getFeatureFlags()

    await saveConversationMessage(user.id, 'user', messageText)

    const systemPrompt = await buildSystemPrompt(user, plan, pantry, todayLog)
    const reply = history.length > 0
      ? await generateChatWithHistory(systemPrompt, history, messageText)
      : await generateChatContent(systemPrompt, messageText)

    await saveConversationMessage(user.id, 'assistant', reply)
    await sendMessage(chatId, reply)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[telegram webhook]', error)
    return NextResponse.json({ ok: true })
  }
}

async function sendWelcomeWithPlan(chatId: number, user: Record<string, unknown>) {
  const isSummary = ['summary', 'minimal'].includes((user.messaging_mode as string) || '');
  const scheduleText = isSummary
    ? `☀️ One morning briefing + 🌙 one end-of-day summary`
    : `☀️ Wake check → meal reminders → check-ins → 🌙 evening recap`;

  const welcomeText =
    `🎉 Welcome${user.name ? `, ${user.name}` : ''}! I'm *Kanshi*, your AI nutrition coach.\n\n` +
    `Your 7-day meal plan is ready. Here's what I can do:\n\n` +
    `📅 /plan — Today's full meal schedule with macros\n` +
    `🕐 /today — What's left for the day + progress so far\n` +
    `📊 /stats — Weekly summary, streak & adherence\n` +
    `🔄 /swap [meal] — e.g. "swap my dinner" for an alternative\n` +
    `🔔 /mode — Toggle full vs minimal daily messages\n` +
    `❓ /help — Show this message again\n\n` +
    `Every day you'll get:\n${scheduleText}\n\n` +
    `Here's today 👇`;

  await sendMessage(chatId, welcomeText);

  if (user.id) {
    const plan = await getActivePlan(user.id as string);
    if (plan) {
      await sendTodayPlanImproved(chatId, plan, user);
    } else {
      await sendMessage(chatId, `No meal plan generated yet. Tap */plan* to generate one.`);
    }
  }
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

async function sendMealLoggedResponse(chatId: number, pantryResult: PantryConsumptionResult | null) {
  if (!pantryResult) {
    await sendMessage(chatId, `Already logged this meal.`)
    return
  }

  if (!pantryResult.lowOrOut.length) {
    await sendMessage(chatId, `✅ Logged! Keep it up 🔒`)
    return
  }

  const items = pantryResult.lowOrOut.slice(0, 3)
  await sendMessage(chatId,
    `✅ Logged! Pantry updated.\n\nRunning low or missing: *${items.join(', ')}*`
  )

  for (const item of items) {
    await sendButtons(chatId, `${item} may need restocking. Add it to your shopping list?`, pantryAlertButtons(item))
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

  const items = Array.isArray(list?.items) ? list.items as Array<Record<string, unknown>> : []
  const exists = items.some(item => String(item.name || '').toLowerCase() === itemName.toLowerCase())
  if (exists) return

  const nextItems = [...items, { name: itemName, quantity: 'as needed', category: 'groceries', checked: false }]

  if (list?.id) {
    await db.from('shopping_lists').update({ items: nextItems }).eq('id', list.id)
  } else {
    await db.from('shopping_lists').insert({
      user_id: userId,
      items: nextItems,
      ordered: false,
      order_source: 'telegram',
    })
  }
}

async function sendTodayPlanImproved(chatId: number, plan: Record<string, unknown>, user: Record<string, unknown>) {
  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = DAY_NAMES[dayIndex];
  const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const workoutDays = (user.workout_days as string[]) || [];
  const isWorkoutDay = workoutDays.includes(dayName);
  const targetKcal = (user.target_kcal as number) || 2000;
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined;
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;

  if (!todayPlan) {
    await sendMessage(chatId, `No plan found for ${dayLabel}. Try /plan again in a minute.`);
    return;
  }

  const slots = normalizeMealSlots(todayPlan.slots || todayPlan.meals);
  if (!slots || slots.length === 0) {
    await sendMessage(chatId, `Today's plan looks empty. Send /plan again to retry.`);
    return;
  }

  let msg = `📅 *Today's Plan* — ${dayLabel}${isWorkoutDay ? ' 💪' : ''}\n\n`;

  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
  for (const slot of slots) {
    const slotKey = slot.slot;
    const label = SLOT_LABELS[slotKey] || `🍽️ ${slotKey.replace(/_/g, ' ')}`;
    const time = slot.time;
    const meal = slot.meal;
    const kcal = slot.kcal;
    const protein = slot.protein_g;
    const carbs = slot.carbs_g;
    const fat = slot.fat_g;
    totalKcal += kcal;
    totalProtein += protein;
    totalCarbs += carbs;
    totalFat += fat;

    const timePrefix = time ? `${time} ` : '';
    msg += `${timePrefix}*${label}*\n${meal}`;
    if (kcal > 0) {
      let macroStr = `${kcal} kcal`;
      if (protein > 0) macroStr += ` | ${protein}g protein`;
      msg += ` _(${macroStr})_`;
    }
    msg += '\n\n';
  }

  msg += `Total: ${totalKcal} kcal | ${totalProtein}g protein | ${totalCarbs}g carbs | ${totalFat}g fat`;

  await sendMessage(chatId, msg);
}

async function sendTodayProgress(chatId: number, plan: Record<string, unknown>, user: Record<string, unknown>, todayLog: Record<string, unknown> | null) {
  const today = new Date();
  const dayIndex = today.getDay();
  const workoutDays = (user.workout_days as string[]) || [];
  const isWorkoutDay = workoutDays.includes(DAY_NAMES[dayIndex]);
  const targetKcal = (user.target_kcal as number) || 2000;
  const dayKcal = isWorkoutDay ? Math.round(targetKcal * 1.12) : targetKcal;
  const targetProtein = (user.target_protein_g as number) || 0;

  const loggedKcal = (todayLog?.total_kcal as number) || 0;
  const loggedProtein = (todayLog?.total_protein_g as number) || 0;
  const mealsEaten = (todayLog?.meals_eaten as Array<Record<string, unknown>>) || [];
  const mealsSkipped = (todayLog?.meals_skipped as string[]) || [];
  const mealsSubstituted = (todayLog?.meals_substituted as Array<Record<string, unknown>>) || [];
  const loggedSlots = new Set([
    ...mealsEaten.map(m => m.slot as string),
    ...mealsSkipped,
    ...mealsSubstituted.map(m => m.slot as string),
  ]);

  const pct = dayKcal > 0 ? Math.round((loggedKcal / dayKcal) * 100) : 0;

  let msg = `🕐 *Today so far*\n\n`;
  msg += `✅ Logged: ${loggedKcal} kcal / ${dayKcal} kcal (${pct}%)\n`;
  msg += `Protein: ${loggedProtein}g / ${targetProtein}g\n\n`;

  const planData = plan.plan_data as { days?: Record<string, unknown>[] } | undefined;
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;
  const slots = normalizeMealSlots(todayPlan?.slots || todayPlan?.meals);

  if (slots && slots.length > 0) {
    const remaining = slots.filter(s => !loggedSlots.has(s.slot));
    if (remaining.length > 0) {
      msg += `Remaining meals:\n`;
      for (const slot of remaining) {
        const slotKey = slot.slot;
        const time = slot.time;
        const meal = slot.meal;
        const timeStr = time ? ` (${time})` : '';
        const slotLabel = slotKey.replace(/_/g, ' ');
        msg += `• ${slotLabel}${timeStr} — ${meal}\n`;
      }
    } else {
      msg += `All meals logged for today! 🎉`;
    }
  }

  await sendMessage(chatId, msg);
}

async function sendWeeklyStats(chatId: number, user: Record<string, unknown>) {
  const db = getServerClient();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const fromDate = sevenDaysAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  const { data: logs } = await db
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .gte('log_date', fromDate)
    .lte('log_date', toDate);

  const streak = (user.current_streak as number) || 0;
  const targetKcal = (user.target_kcal as number) || 2000;
  const targetProtein = (user.target_protein_g as number) || 0;

  const daysLogged = logs?.length || 0;
  const avgKcal = daysLogged > 0
    ? Math.round((logs || []).reduce((sum, l) => sum + (l.total_kcal || 0), 0) / daysLogged)
    : 0;
  const avgProtein = daysLogged > 0
    ? Math.round((logs || []).reduce((sum, l) => sum + (l.total_protein_g || 0), 0) / daysLogged)
    : 0;

  let msg = `📊 *Your week*\n\n`;
  msg += `🔥 Streak: ${streak} days\n`;
  msg += `📅 This week: ${daysLogged}/7 days logged\n`;
  msg += `🎯 Avg calories: ${avgKcal} / ${targetKcal} kcal\n`;
  msg += `💪 Avg protein: ${avgProtein}g / ${targetProtein}g\n\n`;
  msg += `Keep it up! 💪`;

  await sendMessage(chatId, msg);
}

async function sendHelpMessage(chatId: number, user: Record<string, unknown>) {
  const isSummary = ['summary', 'minimal'].includes((user.messaging_mode as string) || '');
  const scheduleText = isSummary
    ? `☀️ One morning briefing + 🌙 one end-of-day summary`
    : `☀️ Wake check → meal reminders → check-ins → 🌙 evening recap`;

  const msg =
    `Here's how to use me:\n\n` +
    `📅 /plan — Today's full meal schedule with macros\n` +
    `🕐 /today — What's left for the day + progress so far\n` +
    `📊 /stats — Weekly summary, streak & adherence\n` +
    `🔄 /swap [meal] — e.g. "swap my dinner" to get an alternative\n` +
    `🥗 /pantry — View & update your pantry\n` +
    `🔔 /mode — Toggle full vs summary messaging\n` +
    `❓ /help — Show this message again\n\n` +
    `Every day you'll get:\n${scheduleText}`;

  await sendMessage(chatId, msg);
}

async function handleSwapRequest(chatId: number, user: Record<string, unknown>, plan: Record<string, unknown>, messageText: string) {
  const db = getServerClient();
  const slotMatch = messageText.match(/\b(early_morning|breakfast|mid_morning|lunch|evening_snack|dinner|pre_bed|morning|snack|evening)\b/i);
  let slotName = slotMatch?.[1]?.toLowerCase() || '';
  const aliasMap: Record<string, string> = { morning: 'breakfast', snack: 'evening_snack', evening: 'dinner' };
  if (aliasMap[slotName]) slotName = aliasMap[slotName];

  const dayIndex = new Date().getDay();
  const planData = plan.plan_data as { days?: Array<Record<string, unknown>> };
  const todayPlan = planData?.days?.[dayIndex] as Record<string, unknown> | undefined;
  const slots = normalizeMealSlots(todayPlan?.slots || todayPlan?.meals);

  if (!slotName || !slots) {
    await sendMessage(chatId, `Which meal do you want to swap? Try:\n/swap breakfast\n/swap lunch\n/swap dinner\n/swap evening_snack`);
    return;
  }

  const currentSlot = slots.find(s => s.slot === slotName);
  if (!currentSlot) {
    await sendMessage(chatId, `Couldn't find *${slotName}* in today's plan. Available: ${slots.map(s => s.slot).join(', ')}`);
    return;
  }

  await sendTyping(chatId);

  const goal = (user.goal as string) || 'healthy eating';
  const restrictions: string[] = [];
  if (!user.okay_with_dairy) restrictions.push('no dairy');
  if (!user.okay_with_eggs) restrictions.push('no eggs');
  if (!user.okay_with_meat_fish) restrictions.push('no meat or fish');
  if ((user.allergies as string[])?.length) restrictions.push(`allergic to: ${(user.allergies as string[]).join(', ')}`);

  const prompt = `User wants to swap ${currentSlot.meal || slotName} for ${slotName} on their ${goal} diet. Suggest 2 alternative Indian meals with similar calories (around ${currentSlot.kcal || 300} kcal) and macros. User restrictions: ${restrictions.join(', ') || 'none'}. Return JSON only: {"alternatives": [{"meal": "string", "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "reason": "string"}]}`;

  let alternatives: Array<{ meal: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; reason: string }> = [];
  try {
    const raw = await generateChatContent('You are a nutrition expert. Return only valid JSON, no markdown.', prompt);
    const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    alternatives = parsed.alternatives || [];
  } catch {
    await sendMessage(chatId, `Couldn't generate alternatives right now. Try again in a moment.`);
    return;
  }

  if (!alternatives.length) {
    await sendMessage(chatId, `No alternatives found. Try again in a moment.`);
    return;
  }

  await db.from('users').update({
    onboarding_state: { step: 'waiting_swap', data: { swap_alternatives: alternatives, swap_slot: slotName } },
  }).eq('id', user.id);

  const msgText = `🔄 *Swap ${slotName.replace(/_/g, ' ')}*\n\nCurrent: ${currentSlot.meal || slotName}\n\nChoose an alternative:`;
  const keyboard = alternatives.map((alt, i) => [
    { text: `${alt.meal} (${alt.kcal} kcal) — ${alt.reason}`, callback_data: `swap:${slotName}:${i}` },
  ]);

  await sendButtons(chatId, msgText, keyboard);
}

async function handleSubstitutedMeal(chatId: number, user: Record<string, unknown>, slot: string, dishName: string) {
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
  await sendMessage(chatId,
    `${dishName} — roughly *${estimated.kcal || '?'} kcal*, ${estimated.protein_g || '?'}g protein.\n\n${comment}`
  )
}

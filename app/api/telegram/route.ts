import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'
import { buildSystemPrompt, getFeatureFlags } from '@/lib/prompt-builder'
import { generateChatContent } from "@/lib/gemini"
import { sendMessage, sendTyping, sendButtons, answerCallbackQuery, mealConfirmButtons, pantryAlertButtons } from '@/lib/telegram-helpers'

// ============================================================
// DB HELPERS
// ============================================================
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

// ============================================================
// TODAY'S PLAN FORMATTER
// ============================================================
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

  const slots = (todayPlan.slots || todayPlan.meals) as Record<string, unknown>[] | undefined;
  if (!slots || slots.length === 0) {
    await sendMessage(chatId, `Today's plan looks empty. Send /plan again to retry.`);
    return;
  }

  let msg = `*📅 ${dayLabel}${isWorkoutDay ? ' 💪 Workout Day' : ''}*\n`;
  msg += `Target: *${dayKcal} kcal* · Protein: *${user.target_protein_g || '—'}g*\n\n`;

  let totalKcal = 0;
  for (const slot of slots) {
    const slotKey = (slot.slot || slot.name || '') as string;
    const label = SLOT_LABELS[slotKey] || `🍽️ ${slotKey.replace(/_/g, ' ')}`;
    const meal = (slot.meal || slot.description || slot.food || '') as string;
    const kcal = Number(slot.kcal || slot.calories || 0);
    const protein = Number(slot.protein_g || slot.protein || 0);
    totalKcal += kcal;

    msg += `*${label}*\n${meal}`;
    if (kcal > 0 || protein > 0) msg += ` _(${kcal} kcal · ${protein}g P)_`;
    msg += '\n\n';
  }

  msg += `📊 Total: ~${totalKcal} kcal\n\n`;
  msg += `💬 _Tap to ask: swap a meal, log what you ate, get a recipe_`;

  await sendMessage(chatId, msg);
}

// ============================================================
// WEBHOOK HANDLER
// ============================================================
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

    // ---- Callback: meal confirmation buttons ----
    if (callbackData.startsWith('confirm:')) {
      const [, slot, action] = callbackData.split(':')
      const user = await getUser(chatId)
      if (!user) return NextResponse.json({ ok: true })

      if (action === 'yes') {
        await logMealConfirmed(db, user, slot)
        await sendMessage(chatId, `✅ Logged! Keep it up 🔒`)
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

    // ---- Callback: skip nothing ----
    if (callbackData.startsWith('skipnothing:')) {
      const slot = callbackData.split(':')[1]
      const user = await getUser(chatId)
      if (user) await logMealSkipped(db, user, slot)
      await sendMessage(chatId, `Noted — logged as skipped.`)
      return NextResponse.json({ ok: true })
    }

    // ---- Callback: pantry alert buttons ----
    if (callbackData.startsWith('pantry:')) {
      const [, action, itemName] = callbackData.split(':')
      const user = await getUser(chatId)
      if (user && action === 'add') {
        const { data: list } = await db.from('shopping_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single()
        if (list) {
          const items = [...(list.items || []), { name: itemName, quantity: 'as needed', category: 'groceries', checked: false }]
          await db.from('shopping_lists').update({ items }).eq('id', list.id)
          await sendMessage(chatId, `Added ${itemName} to your shopping list.`)
        }
      } else {
        await sendMessage(chatId, `Got it!`)
      }
      void pantryAlertButtons // suppress unused warning — called in cron
      return NextResponse.json({ ok: true })
    }

    // ---- Check bot state (e.g. waiting for meal description after "had something else") ----
    const stateUser = await getUser(chatId)
    if (stateUser?.onboarding_state?.step === 'waiting_meal_desc') {
      const slot = stateUser.onboarding_state.data?.slot as string
      await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('id', stateUser.id)
      await sendTyping(chatId)
      await handleSubstitutedMeal(chatId, stateUser, slot, messageText)
      return NextResponse.json({ ok: true })
    }

    // ---- /start ----
    if (messageText.startsWith('/start')) {
      const payload = messageText.slice('/start'.length).trim()
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload)

      if (isUUID) {
        const { data: webUser } = await db
          .from('users')
          .update({ telegram_chat_id: chatId, telegram_username: username, telegram_connected: true, updated_at: new Date().toISOString() })
          .eq('id', payload)
          .select()
          .single()

        if (webUser) {
          await sendMessage(chatId, `✅ Linked! Welcome${webUser.name ? `, ${webUser.name}` : ''} 🔒\n\nSend /plan to see today's meals.`)
          return NextResponse.json({ ok: true })
        }
      }

      // Try username match
      const { data: byUsername } = await db.from('users').select('*').eq('telegram_username', username).single()
      if (byUsername) {
        await db.from('users').update({ telegram_chat_id: chatId, telegram_connected: true }).eq('id', byUsername.id)
        await sendMessage(chatId, `Welcome back${byUsername.name ? `, ${byUsername.name}` : ''}! 🔒\n\nSend /plan to see today's meals.`)
        return NextResponse.json({ ok: true })
      }

      // Not found — ask for phone number or create bare record
      const existingUser = await getUser(chatId)
      if (!existingUser) {
        await db.from('users').insert({ telegram_chat_id: chatId, telegram_username: username })
      }
      const updatedUser = await getUser(chatId)

      if (updatedUser?.onboarding_complete) {
        await sendMessage(chatId, `Welcome back! 🔒\n\nSend /plan to see today's meals.`)
      } else {
        await sendMessage(
          chatId,
          `Hey${username ? ` @${username}` : ''}! Welcome to *Lockin* 🔒\n\n` +
          `I'm your AI nutrition coach. Set up your profile (takes 5 min):\n` +
          `👉 ${process.env.APP_URL}/onboarding\n\n` +
          `Already signed up on the website? What's your phone number? (the one you used on lockin.food)`
        )
        await db.from('users').update({ onboarding_state: { step: 'waiting_phone', data: {} } }).eq('telegram_chat_id', chatId)
      }
      return NextResponse.json({ ok: true })
    }

    // ---- State: waiting for phone number to match account ----
    if (stateUser?.onboarding_state?.step === 'waiting_phone') {
      const phone = messageText.replace(/\D/g, '')
      if (phone.length >= 10) {
        const { data: phoneUser } = await db.from('users').select('*').eq('phone_number', phone).single()
          .then(r => r)
          || await db.from('users').select('*').eq('phone_number', `+91${phone}`).single()

        if (phoneUser && phoneUser.id !== stateUser.id) {
          await db.from('users').update({ telegram_chat_id: chatId, telegram_connected: true, telegram_username: username, onboarding_state: { step: 0, data: {} } }).eq('id', phoneUser.id)
          await db.from('users').delete().eq('id', stateUser.id)
          await sendMessage(chatId, `✅ Account found! Welcome${phoneUser.name ? `, ${phoneUser.name}` : ''} 🔒\n\nSend /plan to see today's meals.`)
        } else {
          await db.from('users').update({ onboarding_state: { step: 0, data: {} } }).eq('telegram_chat_id', chatId)
          await sendMessage(chatId, `Hmm, couldn't find that number. Try setting up your profile:\n👉 ${process.env.APP_URL}/onboarding`)
        }
      } else {
        await sendMessage(chatId, `That doesn't look like a valid phone number. Try again or go to:\n👉 ${process.env.APP_URL}/onboarding`)
      }
      return NextResponse.json({ ok: true })
    }

    // ---- /deletedata ----
    if (messageText === '/deletedata') {
      await sendMessage(chatId, `This will permanently delete your profile, meal plans, pantry, and all history.\n\nType *DELETE* to confirm.`)
      return NextResponse.json({ ok: true })
    }

    if (messageText === 'DELETE') {
      const user = await getUser(chatId)
      if (user) {
        await Promise.all([
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

    // ---- Guard: require completed onboarding ----
    const user = await getUser(chatId)
    if (!user || !user.onboarding_complete) {
      await sendMessage(chatId, `Complete your profile first:\n👉 ${process.env.APP_URL}/onboarding`)
      return NextResponse.json({ ok: true })
    }

    // ---- /plan ----
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
      await sendTodayPlan(chatId, plan, user)
      return NextResponse.json({ ok: true })
    }

    // ---- Conversational messages → Gemini ----
    await sendTyping(chatId)
    const [plan, pantry, todayLog] = await Promise.all([
      getActivePlan(user.id),
      getPantry(user.id),
      getTodayLog(user.id),
    ])
    void getFeatureFlags()

    const systemPrompt = await buildSystemPrompt(user, plan, pantry, todayLog)
    const reply = await generateChatContent(systemPrompt, messageText)
    await sendMessage(chatId, reply)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[telegram webhook]', error)
    return NextResponse.json({ ok: true })
  }
}

// ============================================================
// HELPERS
// ============================================================
async function logMealConfirmed(db: ReturnType<typeof getServerClient>, user: Record<string, unknown>, slot: string) {
  const today = new Date().toISOString().split('T')[0]
  const plan = await getActivePlan(user.id as string)
  const planData = plan?.plan_data as { days?: Array<Record<string, unknown>> } | undefined
  const dayIndex = new Date().getDay()
  const todayPlan = planData?.days?.[dayIndex]
  const slots = todayPlan?.slots as Array<Record<string, unknown>> | undefined
  const slotData = slots?.find(s => s.slot === slot) as Record<string, unknown> | undefined

  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const meals_eaten = [...((log?.meals_eaten as unknown[]) || []), {
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
}

async function logMealSkipped(db: ReturnType<typeof getServerClient>, user: Record<string, unknown>, slot: string) {
  const today = new Date().toISOString().split('T')[0]
  const { data: log } = await db.from('daily_logs').select('*').eq('user_id', user.id).eq('log_date', today).single()
  const meals_skipped = [...((log?.meals_skipped as string[]) || []), slot]
  await db.from('daily_logs').upsert({ user_id: user.id, log_date: today, meals_skipped }, { onConflict: 'user_id,log_date' })
}

async function handleSubstitutedMeal(chatId: number, user: Record<string, unknown>, slot: string, dishName: string) {
  const plan = await getActivePlan(user.id as string)
  const planData = plan?.plan_data as { days?: Array<Record<string, unknown>> } | undefined
  const dayIndex = new Date().getDay()
  const todayPlan = planData?.days?.[dayIndex]
  const slots = todayPlan?.slots as Array<Record<string, unknown>> | undefined
  const planned = slots?.find(s => s.slot === slot) as Record<string, unknown> | undefined

  const prompt = `The user was supposed to eat: ${planned?.meal || slot}.
They actually ate: ${dishName}.
Estimate the macros (kcal, protein_g, carbs_g, fat_g).
Estimate key ingredients (name, approximate grams).
Return JSON: { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "ingredients": [{"name":"","grams":0}], "comment": "brief suggestion" }`

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

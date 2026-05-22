import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { buildMealPlanPrompt } from '@/lib/prompt-builder';
import { generatePlanContent } from '@/lib/gemini';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: `User not found: ${userError?.message}` }, { status: 404 });
    }

    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId);

    const prompt = await buildMealPlanPrompt(user, pantryItems || []);

    let text: string;
    try {
      text = await generatePlanContent(prompt);
    } catch (geminiError) {
      console.error('[generate-plan] Gemini error:', geminiError);
      return NextResponse.json({ error: `AI error: ${(geminiError as Error).message}` }, { status: 500 });
    }

    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let planData: { days: unknown[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];
      const parsed = JSON.parse(text);
      planData = Array.isArray(parsed) ? { days: parsed } : parsed;
      if (!planData.days || !Array.isArray(planData.days)) throw new Error('No days array in response');
    } catch (parseError) {
      console.error('[generate-plan] parse error. Raw text (first 500):', text.slice(0, 500));
      return NextResponse.json({ error: `AI returned invalid format: ${(parseError as Error).message}` }, { status: 500 });
    }

    await supabase
      .from('meal_plans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    const { data: newPlan, error: insertError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: userId,
        week_start: new Date().toISOString().split('T')[0],
        plan_data: planData,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[generate-plan] DB insert error:', insertError);
      return NextResponse.json({ error: `DB error: ${insertError.message}` }, { status: 500 });
    }

    if (user.telegram_chat_id) {
      const TGAPI = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
      const isMinimal = user.messaging_mode === 'minimal';
      const scheduleText = isMinimal
        ? `☀️ One morning plan + 🌙 one evening summary`
        : `☀️ Morning summary → meal reminders → post-meal check-ins → 🌙 evening recap`;

      const welcomeText =
        `🎉 Your plan is ready, ${user.name || 'there'}! I'm *Kanshi*, your AI nutrition coach.\n\n` +
        `Here's what I can do:\n\n` +
        `📅 /plan — Today's full meal schedule with macros\n` +
        `🕐 /today — What's left for the day + progress so far\n` +
        `📊 /stats — Weekly summary, streak & adherence\n` +
        `🔄 /swap [meal] — e.g. "swap my dinner" to get an alternative\n` +
        `🥗 /pantry — View & update your pantry\n` +
        `❓ /help — Show this message again\n\n` +
        `Every day you'll get:\n${scheduleText}\n\n` +
        `Ready? Here's today 👇`;

      await fetch(`${TGAPI}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text: welcomeText,
          parse_mode: 'Markdown',
        }),
      }).catch(() => {});

      // Send today's meal plan as second message
      const today = new Date();
      const dayIndex = today.getDay();
      const planDays = (planData as { days?: Array<Record<string, unknown>> }).days;
      const todayPlan = planDays?.[dayIndex] as Record<string, unknown> | undefined;
      const slots = (todayPlan?.slots || todayPlan?.meals) as Array<Record<string, unknown>> | undefined;
      if (slots && slots.length > 0) {
        let planMsg = '';
        for (const slot of slots) {
          const time = (slot.time as string) || '';
          const slotName = (slot.slot || slot.name || '') as string;
          const meal = (slot.meal || slot.description || slot.food || '') as string;
          const kcal = Number(slot.kcal || slot.calories || 0);
          const timePrefix = time ? `${time} ` : '';
          const slotLabel = slotName.replace(/_/g, ' ');
          planMsg += `${timePrefix}*${slotLabel}*\n${meal} (${kcal} kcal)\n\n`;
        }
        await fetch(`${TGAPI}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: user.telegram_chat_id,
            text: planMsg.trim(),
            parse_mode: 'Markdown',
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, plan: newPlan });
  } catch (error) {
    console.error('[generate-plan] error:', error);
    return NextResponse.json({ error: `Server error: ${(error as Error).message}` }, { status: 500 });
  }
}

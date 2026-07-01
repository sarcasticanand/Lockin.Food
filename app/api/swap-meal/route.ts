import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getChatModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { userId, slot, currentMeal } = await req.json();
    const db = getServerClient();

    const { data: user } = await db.from('users').select('*').eq('id', userId).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const dietNotes: string[] = [];
    if (!user.okay_with_dairy) dietNotes.push('no dairy');
    if (!user.okay_with_eggs) dietNotes.push('no eggs');
    if (!user.okay_with_meat_fish) dietNotes.push('no meat or fish');

    const slotKcal = Math.round((user.target_kcal || 2000) / 7);

    const prompt = `You are an Indian nutritionist. The user wants to swap their ${(slot as string).replace(/_/g, ' ')} meal.

Current meal: "${currentMeal}"
Diet restrictions: ${dietNotes.join(', ') || 'none'}
Dislikes: ${((user.dislikes as string[]) || []).join(', ') || 'none'}
Goal: ${user.goal}
Approximate kcal for this slot: ${slotKcal} kcal

Give exactly 3 alternative Indian meals. Each must be specific with quantities (e.g. "2 roti + dal makhani 1 cup + cucumber raita"). Respect all restrictions.

Return ONLY a JSON array of 3 strings, no other text:
["alternative 1", "alternative 2", "alternative 3"]`;

    const model = getChatModel('You are an Indian nutritionist who gives specific meal alternatives.');
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    const match = text.match(/\[[\s\S]*\]/);
    if (match) text = match[0];

    const alternatives = JSON.parse(text);
    return NextResponse.json({ alternatives });
  } catch (e) {
    console.error('[swap-meal]', e);
    return NextResponse.json({ alternatives: ['Could not generate alternatives. Try again.'] });
  }
}

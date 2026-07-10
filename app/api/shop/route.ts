import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { normalizeMealSlots } from '@/lib/meal-slots';
import { recomputeDepletion } from '@/lib/pantry-depletion';

interface ShoppingItem { name: string; qty?: number; unit?: string; category?: string; checked?: boolean }

export async function GET(req: NextRequest) {
  const supabase = getServerClient();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ items: list?.items || [] });
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient();
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('plan_data')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!plan) return NextResponse.json({ error: 'No active plan found' }, { status: 404 });

  const { data: pantry } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId)
    .not('status', 'eq', 'out');

  const pantryNames = new Set((pantry || []).map((p: { name: string }) => p.name.toLowerCase()));

  // Extract all shopping ingredients from meal plan
  const ingredientMap = new Map<string, { qty: number; unit: string; category?: string }>();

  const days = plan.plan_data?.days || [];
  for (const day of days) {
    const slots = normalizeMealSlots((day as { slots?: unknown }).slots);
    for (const slot of slots) {
      const ingredients = slot.ingredients || [];
      for (const ing of ingredients) {
        const key = ing.name.toLowerCase();
        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          if (existing.unit === ing.unit) {
            existing.qty += ing.qty || 1;
          }
        } else {
          ingredientMap.set(key, { qty: ing.qty || 1, unit: ing.unit || 'as needed', category: ing.category });
        }
      }
    }
  }

  const items = Array.from(ingredientMap.entries()).map(([name, details]) => ({
    name,
    qty: Math.round(details.qty),
    unit: details.unit,
    category: details.category || categorize(name),
    in_pantry: pantryNames.has(name),
    checked: pantryNames.has(name),
  }));

  items.sort((a, b) => {
    if (a.in_pantry && !b.in_pantry) return 1;
    if (!a.in_pantry && b.in_pantry) return -1;
    return (a.category || '').localeCompare(b.category || '');
  });

  await supabase.from('shopping_lists').insert({
    user_id: userId,
    items,
    ordered: false,
    order_source: 'manual',
  });

  return NextResponse.json({ items });
}

// Mark the latest shopping list ordered and load its items into the pantry.
// This is the input that was missing: without it the pantry stays empty and
// every meal reads as "you own nothing". Called when the user confirms they
// bought the groceries (manually or after a Swiggy order).
export async function PATCH(req: NextRequest) {
  const supabase = getServerClient();
  const { userId, orderSource } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!list) return NextResponse.json({ error: 'No shopping list to order' }, { status: 404 });

  const items = (Array.isArray(list.items) ? list.items : []) as ShoppingItem[];
  // Only stock what's actually being bought (unchecked = not already owned).
  const toStock = items.filter((it) => !it.checked);

  const { data: existing } = await supabase
    .from('pantry_items')
    .select('id, name, quantity, unit')
    .eq('user_id', userId);
  const existingByName = new Map((existing || []).map((p: { name: string }) => [p.name.toLowerCase(), p]));

  const today = new Date().toISOString().slice(0, 10);
  for (const it of toStock) {
    const key = it.name.toLowerCase();
    const prior = existingByName.get(key) as { id: string; quantity: number | null; unit: string | null } | undefined;
    if (prior) {
      // Restocking an existing item — top up the quantity.
      const newQty = (Number(prior.quantity) || 0) + (Number(it.qty) || 0);
      await supabase.from('pantry_items').update({ quantity: newQty, status: 'fresh', purchased_date: today }).eq('id', prior.id);
    } else {
      await supabase.from('pantry_items').insert({
        user_id: userId,
        name: it.name,
        quantity: Number(it.qty) || null,
        unit: it.unit || null,
        category: it.category || null,
        status: 'fresh',
        purchased_date: today,
      });
    }
  }

  await supabase
    .from('shopping_lists')
    .update({ ordered: true, ordered_at: new Date().toISOString(), order_source: orderSource || 'manual' })
    .eq('id', list.id);

  // Project fresh depletion dates from the newly stocked quantities.
  await recomputeDepletion(supabase, userId);

  return NextResponse.json({ stocked: toStock.length });
}

function categorize(name: string): string {
  const n = name.toLowerCase();
  if (/chicken|mutton|fish|egg|paneer|tofu|tuna|prawn/.test(n)) return 'Protein';
  if (/rice|roti|bread|oats|quinoa|wheat|flour|poha|rava/.test(n)) return 'Grains';
  if (/milk|curd|yogurt|cheese|ghee|butter/.test(n)) return 'Dairy';
  if (/dal|lentil|rajma|chole|chana|moong|soya/.test(n)) return 'Legumes';
  if (/onion|tomato|spinach|broccoli|carrot|cucumber|capsicum|beans/.test(n)) return 'Vegetables';
  if (/banana|apple|orange|mango|papaya|berries/.test(n)) return 'Fruits';
  if (/oil|spice|cumin|coriander|turmeric|salt|pepper|masala/.test(n)) return 'Spices & Oils';
  if (/nuts|almonds|walnuts|cashew|makhana|seeds/.test(n)) return 'Nuts & Seeds';
  return 'Other';
}

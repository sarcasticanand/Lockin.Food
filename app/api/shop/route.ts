import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { normalizeMealSlots } from '@/lib/meal-slots';

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

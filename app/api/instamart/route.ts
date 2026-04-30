import { NextRequest, NextResponse } from 'next/server';
import { isInstamartEnabled, searchProducts, addToCart, getAttribution } from '@/lib/instamart';

// Instamart module — returns 503 until enabled in config table
export async function POST(req: NextRequest) {
  const enabled = await isInstamartEnabled();
  if (!enabled) {
    return NextResponse.json(
      { error: 'Instamart integration not yet active.' },
      { status: 503 }
    );
  }

  const { action, query, items } = await req.json();

  if (action === 'search') {
    const results = await searchProducts(query);
    return NextResponse.json({ results });
  }

  if (action === 'add_to_cart') {
    const success = await addToCart(items);
    const attribution = await getAttribution();
    return NextResponse.json({ success, attribution });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET() {
  const enabled = await isInstamartEnabled();
  const attribution = await getAttribution();
  return NextResponse.json({ enabled, attribution });
}

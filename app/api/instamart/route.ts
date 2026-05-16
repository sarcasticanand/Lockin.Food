import { NextRequest, NextResponse } from 'next/server';
import { isInstamartEnabled, searchProducts, addToCart } from '@/lib/instamart';

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
    return NextResponse.json({ success, attribution: 'Powered by Swiggy Instamart' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET() {
  const enabled = await isInstamartEnabled();
  return NextResponse.json({ enabled, attribution: 'Powered by Swiggy Instamart' });
}

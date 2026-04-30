import { getInstamartConfig } from './prompt-builder';

// ============================================================
// SWIGGY INSTAMART MODULE
//
// This module activates when instamart_config.enabled = true
// in the Supabase config table.
//
// To activate (no code change needed):
//   UPDATE config
//   SET value = jsonb_set(value, '{enabled}', 'true')
//   WHERE key = 'instamart_config';
//
// Then implement the actual MCP calls in searchProducts,
// addToCart, and checkout once Swiggy grants API access.
// ============================================================

export interface CartItem {
  name: string;
  qty: number;
  unit: string;
}

export async function isInstamartEnabled(): Promise<boolean> {
  const config = await getInstamartConfig();
  return config.enabled === true;
}

export async function searchProducts(query: string): Promise<Record<string, unknown>[]> {
  const config = await getInstamartConfig();
  if (!config.enabled) return [];

  // TODO: Implement Swiggy MCP call when access is granted
  // POST to config.mcp_url with search_products tool
  console.log(`[Instamart] Would search for: ${query}`);
  return [];
}

export async function addToCart(items: CartItem[]): Promise<boolean> {
  const config = await getInstamartConfig();
  if (!config.enabled) return false;

  // TODO: Implement Swiggy MCP call when access is granted
  // POST to config.mcp_url with update_cart tool
  console.log(`[Instamart] Would add ${items.length} items to cart`);
  return false;
}

export async function checkout(): Promise<{ success: boolean; orderId?: string }> {
  const config = await getInstamartConfig();
  if (!config.enabled || !config.auto_checkout) {
    return { success: false };
  }

  // TODO: Implement Swiggy MCP call when access is granted
  // POST to config.mcp_url with checkout tool
  console.log('[Instamart] Would trigger checkout');
  return { success: false };
}

export async function getAttribution(): Promise<string> {
  const config = await getInstamartConfig();
  return (config.attribution_text as string) || 'Powered by Swiggy Instamart';
}

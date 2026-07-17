import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const INSTAMART_URL = 'https://mcp.swiggy.com/im'

// Open a short-lived MCP session to Swiggy Instamart authenticated as the user
// (Bearer token injected on every request), run `fn`, and always disconnect.
// Serverless-friendly: one connect/call/close per request.
async function withInstamart<T>(accessToken: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(INSTAMART_URL), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const client = new Client({ name: 'lockin.food', version: '1.0.0' }, { capabilities: {} })
  try {
    await client.connect(transport)
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

// MCP tool results wrap content as an array of parts. Swiggy returns a human-
// readable summary part ("Found 23 saved addresses...") plus a JSON part, and
// may also set structuredContent. Prefer structuredContent, else the first
// text part that parses as JSON.
function parseToolResult<T>(result: unknown): T {
  const r = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }> }
  // Use structuredContent only when it actually carries data — some tools
  // (e.g. update_cart) return an empty {} here and put the payload in text.
  if (r?.structuredContent && typeof r.structuredContent === 'object' && Object.keys(r.structuredContent as object).length > 0) {
    return r.structuredContent as T
  }
  const textParts = (r?.content || []).filter((p) => p.type === 'text' && p.text)
  for (const part of textParts) {
    try { return JSON.parse(part.text!) as T } catch { /* summary part — keep looking */ }
  }
  const preview = textParts[0]?.text?.slice(0, 120) || 'empty'
  throw new Error(`No JSON payload in Swiggy tool result (${preview})`)
}

async function call<T>(accessToken: string, name: string, args: Record<string, unknown>): Promise<T> {
  return withInstamart(accessToken, async (client) => {
    const result = await client.callTool({ name, arguments: args })
    return parseToolResult<T>(result)
  })
}

// ---- Typed shapes for the fields we use (Swiggy returns more) ----
export interface SwiggyAddress {
  id: string
  addressLine: string
  addressTag?: string
  addressCategory?: string
}

export interface SwiggyVariation {
  spinId: string
  skuId: string
  quantityDescription: string
  displayName: string
  brandName?: string
  price: { mrp: number; offerPrice: number }
  isInStockAndAvailable: boolean
}

export interface SwiggyProduct {
  displayName: string
  brand: string
  inStock: boolean
  variations: SwiggyVariation[]
}

export interface SwiggyCartItem {
  spinId: string
  skuId: string
  itemName: string
  quantity: number
  discountedFinalPrice: number
  isInStockAndAvailable: boolean
}

export interface SwiggyCart {
  cartTotalAmount: string
  items: SwiggyCartItem[]
  billBreakdown?: { lineItems: Array<{ label: string; value: string }>; toPay: { label: string; value: string } }
  cartId?: string
}

export async function getAddresses(accessToken: string): Promise<SwiggyAddress[]> {
  const res = await call<{ addresses: SwiggyAddress[] }>(accessToken, 'get_addresses', {})
  return res.addresses || []
}

export async function searchProducts(accessToken: string, addressId: string, query: string): Promise<SwiggyProduct[]> {
  const res = await call<{ products: SwiggyProduct[] }>(accessToken, 'search_products', { addressId, query })
  return res.products || []
}

export async function updateCart(
  accessToken: string,
  addressId: string,
  items: Array<{ spinId: string; skuId: string; quantity: number }>
): Promise<SwiggyCart> {
  return call<SwiggyCart>(accessToken, 'update_cart', { selectedAddressId: addressId, items })
}

export async function getCart(accessToken: string): Promise<SwiggyCart> {
  return call<SwiggyCart>(accessToken, 'get_cart', {})
}

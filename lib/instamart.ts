import { getServerClient } from './supabase'

export async function isInstamartEnabled(): Promise<boolean> {
  const { data } = await getServerClient()
    .from('config')
    .select('value')
    .eq('key', 'instamart_config')
    .single()
  return data?.value?.enabled === true
}

// Stubs — activate when Swiggy Builders Club API is available
export async function searchProducts(_query: string): Promise<unknown[]> {
  return []
}

export async function addToCart(_items: Array<{ name: string; qty: number; unit: string }>): Promise<boolean> {
  return false
}

export async function checkout(): Promise<{ success: boolean }> {
  return { success: false }
}

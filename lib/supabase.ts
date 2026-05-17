import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _server: SupabaseClient | null = null
let _browser: SupabaseClient | null = null

export function getServerClient(): SupabaseClient {
  if (!_server) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) throw new Error('Supabase server env vars not set')
    _server = createClient(url, key)
  }
  return _server
}

export function getBrowserClient(): SupabaseClient {
  if (!_browser) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase browser env vars not set')
    _browser = createClient(url, key)
  }
  return _browser
}

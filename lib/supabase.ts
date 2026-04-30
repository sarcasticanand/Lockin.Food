import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singletons — initialized on first call, not at module evaluation time.
// This prevents "supabaseUrl is required" errors during Next.js build.

let serverClient: SupabaseClient | null = null;
let browserClient: SupabaseClient | null = null;

/** Server-side client — uses service role key, bypasses RLS. API routes only. */
export function getServerClient(): SupabaseClient {
  if (!serverClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
    serverClient = createClient(url, key);
  }
  return serverClient;
}

/** Browser-side client — uses anon key, respects RLS. Client components only. */
export function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
    browserClient = createClient(url, key);
  }
  return browserClient;
}

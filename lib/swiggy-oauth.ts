import crypto from 'crypto'
import { getServerClient } from '@/lib/supabase'

// Swiggy Builders MCP OAuth 2.1 (PKCE, public client, no refresh token in v1).
// Verified from https://mcp.swiggy.com/.well-known/oauth-authorization-server
const AUTHORIZE_URL = 'https://mcp.swiggy.com/auth/authorize'
const TOKEN_URL = 'https://mcp.swiggy.com/auth/token'
const REGISTER_URL = 'https://mcp.swiggy.com/auth/register'
const SCOPE = 'mcp:tools'

// The redirect URI must be exact-match allowlisted by Swiggy (email
// builders@swiggy.in for production). localhost is allowed for dev.
function redirectUri(): string {
  const base = process.env.APP_URL || 'http://localhost:3000'
  return `${base}/api/swiggy/callback`
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Register (once) as a public OAuth client via Dynamic Client Registration and
// cache the client_id. Re-registers if the redirect URI changed.
export async function getClientId(): Promise<string> {
  const db = getServerClient()
  const uri = redirectUri()

  const { data: existing } = await db
    .from('swiggy_oauth_client')
    .select('client_id, redirect_uri')
    .eq('id', 1)
    .maybeSingle()

  if (existing?.client_id && existing.redirect_uri === uri) return existing.client_id

  const res = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'lockin.food',
      redirect_uris: [uri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Swiggy client registration failed (${res.status}): ${text.slice(0, 200)}`)
  const reg = JSON.parse(text) as { client_id: string; client_secret?: string }

  await db.from('swiggy_oauth_client').upsert({
    id: 1,
    client_id: reg.client_id,
    client_secret: reg.client_secret || null,
    redirect_uri: uri,
    registered_at: new Date().toISOString(),
  })

  return reg.client_id
}

// Begin linking: create a PKCE challenge, persist the verifier keyed by state,
// and return the authorization URL the user opens (phone + OTP on Swiggy).
export async function buildAuthUrl(userId: string): Promise<string> {
  const db = getServerClient()
  const clientId = await getClientId()

  const codeVerifier = base64url(crypto.randomBytes(32))
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
  const state = base64url(crypto.randomBytes(16))

  await db.from('swiggy_oauth_state').insert({ state, user_id: userId, code_verifier: codeVerifier })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

// Complete linking: exchange the authorization code for an access token using
// the stored PKCE verifier, then persist the token for the user.
export async function handleCallback(code: string, state: string): Promise<{ userId: string }> {
  const db = getServerClient()

  const { data: pending } = await db
    .from('swiggy_oauth_state')
    .select('user_id, code_verifier')
    .eq('state', state)
    .maybeSingle()
  if (!pending) throw new Error('Invalid or expired linking session. Start again.')

  const clientId = await getClientId()
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: pending.code_verifier,
    }).toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`)
  const token = JSON.parse(text) as { access_token: string; token_type?: string; expires_in?: number; scope?: string }

  // Default to ~5 day lifetime if expires_in is absent.
  const expiresInSec = token.expires_in ?? 5 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString()

  await db.from('swiggy_accounts').upsert({
    user_id: pending.user_id,
    access_token: token.access_token,
    token_type: token.token_type || 'Bearer',
    scope: token.scope || SCOPE,
    expires_at: expiresAt,
    connected_at: new Date().toISOString(),
  })
  await db.from('swiggy_oauth_state').delete().eq('state', state)

  return { userId: pending.user_id }
}

// Return a currently-valid access token for the user, or null if not linked or
// expired (v1 has no refresh — expiry means the user must re-link).
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const db = getServerClient()
  const { data } = await db
    .from('swiggy_accounts')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null
  return data.access_token
}

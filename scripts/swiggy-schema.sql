-- Swiggy Instamart integration schema.
-- Run in Supabase SQL editor. Service-role only (no public/anon access).

-- Per-user Swiggy access token (OAuth 2.1, ~5 day lifetime, no refresh in v1).
create table if not exists swiggy_accounts (
  user_id      uuid primary key references users(id) on delete cascade,
  access_token text not null,
  token_type   text default 'Bearer',
  scope        text,
  expires_at   timestamptz not null,
  connected_at timestamptz default now()
);

-- Transient OAuth handshake state: maps the `state` param to the PKCE verifier
-- and the user who initiated linking. Rows are short-lived (deleted on callback).
create table if not exists swiggy_oauth_state (
  state         text primary key,
  user_id       uuid not null references users(id) on delete cascade,
  code_verifier text not null,
  created_at    timestamptz default now()
);

-- Cached Dynamic Client Registration result (one row, id=1). Swiggy issues a
-- public client_id we reuse for every user's authorization.
create table if not exists swiggy_oauth_client (
  id            int primary key default 1,
  client_id     text not null,
  client_secret text,
  redirect_uri  text not null,
  registered_at timestamptz default now()
);

grant select, insert, update, delete on swiggy_accounts     to service_role;
grant select, insert, update, delete on swiggy_oauth_state  to service_role;
grant select, insert, update, delete on swiggy_oauth_client to service_role;

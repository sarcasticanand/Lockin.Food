-- WhatsApp channel support. Run in Supabase SQL editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT FALSE;
-- Timestamp of the user's last inbound WhatsApp message. Proactive sends are
-- only free within 24h of this (Meta's customer-service window), so the
-- dispatcher checks it before choosing WhatsApp as the delivery channel.
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_last_msg_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_whatsapp_phone ON users (whatsapp_phone);

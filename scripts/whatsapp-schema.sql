-- WhatsApp channel support. Run in Supabase SQL editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT FALSE;
-- Timestamp of the user's last inbound WhatsApp message. Proactive sends are
-- only free within 24h of this (Meta's customer-service window), so the
-- dispatcher checks it before choosing WhatsApp as the delivery channel.
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_last_msg_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_whatsapp_phone ON users (whatsapp_phone);

-- When we last sent this user the paid win-back template (max 1 per 7 days).
ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_winback_at TIMESTAMPTZ;

-- Widen the message_type check so the evening-snack check-in can be
-- scheduled (the original constraint only allowed the three main meals).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'scheduled_messages'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE scheduled_messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_message_type_check
  CHECK (message_type IN (
    'wake_check',
    'post_early_morning', 'post_breakfast', 'post_mid_morning', 'post_lunch',
    'post_evening_snack', 'post_dinner', 'post_pre_bed',
    'workout_reminder', 'hydration_1', 'hydration_2',
    'end_of_day'
  ));

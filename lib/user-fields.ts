// Explicit allowlist of user columns that may be written from client-supplied
// payloads (onboarding + profile edits). Anything NOT in this set — id,
// telegram_chat_id, telegram_connected, link_token(_expires_at), otp_code,
// otp_expires_at, otp_attempts, current_streak, total_days_tracked, timestamps
// — is security- or integrity-sensitive and must only be set by server logic,
// never by a spread of the request body. Prevents mass-assignment / account
// hijack via arbitrary column writes.
export const USER_WRITABLE_FIELDS = new Set<string>([
  'name',
  'phone_number',
  'email',
  'telegram_username',
  'goal',
  'condition',
  'condition_notes',
  'target_kg',
  'target_weeks',
  'height_cm',
  'weight_kg',
  'age',
  'sex',
  'activity_level',
  'okay_with_dairy',
  'okay_with_eggs',
  'okay_with_meat_fish',
  'food_style',
  'food_style_notes',
  'allergies',
  'dislikes',
  'dislikes_notes',
  'works_out',
  'workout_type',
  'workout_days',
  'workout_time',
  'region',
  'budget_weekly',
  'max_cooking_time',
  'meal_preps',
  'wake_time',
  'sleep_time',
  'messaging_mode',
  'notification_opt_outs',
  'onboarding_complete',
  'bmi',
  'bmr',
  'tdee',
  'target_kcal',
  'target_protein_g',
  'target_carbs_g',
  'target_fat_g',
])

// Return a copy of `input` containing only the allowlisted, writable fields.
export function pickWritableUserFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (USER_WRITABLE_FIELDS.has(key)) out[key] = value
  }
  return out
}

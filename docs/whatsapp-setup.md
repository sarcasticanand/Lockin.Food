# WhatsApp Cloud API setup (one-time, ~30 min)

We use Meta's Cloud API directly — no BSP (Gupshup/Wati), no per-message markup.
User-initiated conversations are free; you only ever pay if we message first
after the 24h window closes (we currently never do).

## 1. Meta app

1. Go to https://developers.facebook.com/apps → **Create App**.
2. Add app name + email → select use case **"Connect with customers through WhatsApp"** → Next.
3. Select or create a **business portfolio** → Create app.
4. You land on **Connect on WhatsApp → Quickstart** → click **Start using the API**.
5. On **API Setup**: connect/create a WhatsApp Business account. A free **test
   number** is provisioned automatically — build and test with it (it can
   message up to 5 whitelisted recipients; add your own number under "To").
   For launch, add your real number later under **Add phone number**
   (must NOT be registered on the regular WhatsApp app).

## 2. Credentials → Vercel env vars

From **WhatsApp → API Setup**:

| Env var | Where to find it |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | "Phone number ID" under the From phone number dropdown |
| `WHATSAPP_TOKEN` | Permanent token — see below. (The dashboard's "Generate access token" button gives a 24h temporary token; fine for the first curl test, not for production.) |
| `WHATSAPP_VERIFY_TOKEN` | Any random string you invent (e.g. `openssl rand -hex 16`) |
| `WHATSAPP_NUMBER` | The full number without '+', e.g. `919729973400` — used for wa.me deep links from calendar events |

Also save the **WhatsApp Business account ID** (shown in API Setup) — not
needed by the code today, but required later for template management.

### Permanent token (system user)

1. https://business.facebook.com/latest/settings → **System users** → **Add+**.
2. Select the system user → **Assign Assets**:
   - your app → toggle **Manage app** (Full control)
   - your WhatsApp account → toggle **Manage WhatsApp Business accounts** (Full control)
3. **Generate token** with permissions:
   - `business_management`
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copy it once (it's not shown again) → `WHATSAPP_TOKEN` in Vercel.

## 3. Webhook

⚠️ Deploy the app (with env vars set) BEFORE this step — Meta pings the URL
live during "Verify and save".

In **WhatsApp → Configuration → Webhook**:

- Callback URL: `https://lockin.food/api/whatsapp`
- Verify token: the same `WHATSAPP_VERIFY_TOKEN` value
- Click **Verify and save** (our GET handler echoes the challenge)
- Under **Webhook fields**, subscribe to **messages**

## 4. Database

Run `scripts/whatsapp-schema.sql` in the Supabase SQL editor.

## 5. Test

Message the bot number from your own WhatsApp ("hi"). Because your phone
number matches your lockin.food account, it should auto-link and send the
welcome + today's plan. Then try: a meal photo, "swap my dinner", "plan".

## 6. Launch mode

While the app is in Development mode, only numbers added as test recipients
can message it. Switch the app to **Live** mode for the public (requires a
privacy policy URL — we have `/privacy`) and complete Meta Business
verification for higher messaging limits.

## Click-to-WhatsApp ads (the acquisition loop)

In Meta Ads Manager: campaign objective **Engagement** → conversion location
**WhatsApp** → attach the bot number, set a pre-filled first message (e.g.
"Hi Kanshi, build my meal plan"). Conversations started from these ads are
free for 72 hours.

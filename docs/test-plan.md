# lockin.food end-to-end test plan

Test number: **+91 83685 55072** (Kanshi). Site: **https://www.lockin.food**

## Blockers to clear first

| # | Blocker | Effect if not done | Fix |
|---|---|---|---|
| B1 | `lockin.food` not verified in Resend | **Every email fails** (403). OTP login and win-back are dead. | resend.com/domains → verify lockin.food. DNS records are on Namecheap already; check they resolve, then hit Verify. |
| B2 | Missing service_role GRANTs | Deleting a user leaves orphan rows; some writes 403 | Run in Supabase SQL editor:<br>`GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_history TO service_role;`<br>`GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO service_role;` |

Until B1 is cleared, skip section 8 (login) and 9 (win-back) — they will fail for reasons unrelated to the code.

---

## 1. Onboarding (new user)

| # | Step | Expected |
|---|---|---|
| 1.1 | Open lockin.food on your phone | Hero says "daily check-ins on **WhatsApp**", no Telegram anywhere |
| 1.2 | Tap "Chat on WhatsApp" (hero) | WhatsApp opens, chat with Kanshi, message pre-typed: *"Hi Kanshi, I'm ready to start"* |
| 1.3 | Send it without having onboarded | Bot replies telling you to set up a profile first, with the onboarding link |
| 1.4 | Tap "Get started", complete all 10 steps | Each step advances; goal/stats/activity are required |
| 1.5 | On step 9, leave email blank | **Next stays disabled** (email now required) |
| 1.6 | Enter an invalid email (`abc@`) | Red "Enter a valid email address", Next disabled |
| 1.7 | Enter valid name + 10-digit number + email | Next enables |
| 1.8 | On the macros screen | BMI, calories, protein shown. **Sanity check: for a desk job pick "Sedentary", not "Very Active"** |
| 1.9 | Generate plan | Takes 30–60s, lands on "Your plan is ready" |
| 1.10 | Check the calorie number | Should match your target (not wildly higher). This was the bug fixed by per-slot budgets |

## 2. First WhatsApp contact

| # | Step | Expected |
|---|---|---|
| 2.1 | On the success screen tap "Open WhatsApp" | Opens Kanshi with message pre-typed |
| 2.2 | Hit send | Within ~10s: welcome message (pin-chat tip + calendar link + command list), then today's plan |
| 2.3 | Check the plan message | Meal times match your wake/sleep. Dish names are specific Indian dishes with quantities |
| 2.4 | Add day totals from the plan | Should sum close to your daily target |

## 3. Conversation

| # | Send | Expected |
|---|---|---|
| 3.1 | `plan` | Today's full plan |
| 3.2 | `today` | What's left + progress so far |
| 3.3 | `stats` | Streak, days logged, averages |
| 3.4 | "is paneer good for fat loss" | A real answer in dietician tone. **No em dashes, no "Great question!", no "Hope this helps"** |
| 3.5 | "swap my dinner" | 2 alternatives with calories, tap one to apply |
| 3.6 | After swapping, send `plan` | Dinner reflects the new choice |
| 3.7 | Reply within ~10s each time | Slow/no reply = regression (webhook or window issue) |

## 4. Photo logging

| # | Step | Expected |
|---|---|---|
| 4.1 | Send a photo of a real meal | Identifies the dish, gives kcal + macros, 3 buttons: Log it / Not quite / Don't log |
| 4.2 | Tap "Log it" | Confirms logged; may flag low pantry items |
| 4.3 | Send `today` | The logged meal is counted in the totals |
| 4.4 | Send a photo of something not food | Should say it can't make out the meal, not hallucinate a dish |
| 4.5 | Tap "Not quite" on a photo | Asks you to type what it actually was |
| 4.6 | Judge the calorie estimate | Rough is fine (±30%); wildly wrong is worth reporting |

## 5. Daily message cadence

Set wake/sleep so a slot lands soon, or just observe over a day.

| # | Expectation |
|---|---|
| 5.1 | Morning: day plan arrives near your wake time |
| 5.2 | ~30 min after each main meal: check-in with Yes / Something else / Skipped |
| 5.3 | Tap "Yes" | Meal logged, pantry updated |
| 5.4 | Tap "Skipped" | Asks if you ate something else |
| 5.5 | Night (≤23:00): summary with **real numbers** from what you logged |
| 5.6 | If you logged nothing all day | Summary says so instead of inventing numbers |
| 5.7 | If you chose "summary" mode | Only 2 messages/day (morning + night), no meal check-ins |
| 5.8 | Go quiet 24h+, then message | You should **not** receive a stale "Good morning" at night (messages >2.5h late are dropped) |

## 6. Calendar

| # | Step | Expected |
|---|---|---|
| 6.1 | Send `calendar` | Link to `/cal/<your-id>` |
| 6.2 | Open it on iPhone | "Add to Apple Calendar" first, Google second |
| 6.3 | Tap Apple Calendar | Subscribe prompt, then meals appear in Calendar |
| 6.4 | Check an event | Title = meal name + time. Description links back to WhatsApp |
| 6.5 | Check date range | Only today + tomorrow (deliberate: drives you back to the bot) |
| 6.6 | Regenerate your plan, wait a few hours | Calendar updates on its own |

## 7. Web dashboard

| # | Step | Expected |
|---|---|---|
| 7.1 | Open dashboard | Today's meals, macro rings, streak |
| 7.2 | "Eaten ✓" on a meal | Rings update |
| 7.3 | "Swap" on a meal | Alternatives load, applying updates the plan |
| 7.4 | Profile → change activity level → Save | Targets recalculate, plan regenerates ("Updating plan...") |
| 7.5 | Profile → "Open WhatsApp chat" | Opens with *"Send me my plan for today"* pre-typed |
| 7.6 | Pantry, Plan, Progress pages | Load without errors, no Telegram references |

## 8. Login / OTP (needs B1 cleared)

| # | Step | Expected |
|---|---|---|
| 8.1 | Clear site data, open lockin.food, choose log in | Asks for phone |
| 8.2 | Enter your number **while your WhatsApp window is open** | Code arrives **on WhatsApp**; screen says "sent to your WhatsApp" |
| 8.3 | Enter the code | Logged in, dashboard loads |
| 8.4 | Repeat after 24h+ of silence | Code arrives **by email**; screen says email |
| 8.5 | Enter a wrong code 6 times | Blocked after 5 attempts |
| 8.6 | Enter a number that isn't registered | Generic "code sent" (no account enumeration) |

## 9. Win-back (needs B1 cleared)

| # | Step | Expected |
|---|---|---|
| 9.1 | Stay quiet 3+ days | ~8am IST: email "your meal plan is waiting" |
| 9.2 | Tap "Continue on WhatsApp" | WhatsApp opens, *"Hi Kanshi, I'm back. Send me today's plan"* pre-typed |
| 9.3 | Send it | Bot replies with the plan; daily messages resume |
| 9.4 | Stay quiet again next day | **No second email** (max 1 per 7 days) |

## 10. Groceries (optional)

| # | Step | Expected |
|---|---|---|
| 10.1 | Send `groceries` | Either a Swiggy link to connect, or a built cart |
| 10.2 | Connect Swiggy, resend | Cart with items + bill total |
| 10.3 | Confirm | It **never** places the order, only prepares the cart |

## 11. Things most likely to break

- Reply latency >30s or silence → webhook or 24h window
- "Good morning" arriving at night → staleness guard failed
- Plan calories not matching the stated target → per-slot budget regression
- Any email not arriving → almost certainly B1
- Any mention of Telegram in UI → missed string
- Bot writing with em dashes or "Great question!" → voice prompt regression

## 12. What to record

For each failure: what you sent, what you expected, what happened, and the time (IST). Timestamps let the logs and DB be checked against the exact moment.

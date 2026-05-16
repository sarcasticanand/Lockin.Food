import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream">
      <nav className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
        <Link href="/" className="font-display font-bold text-xl text-[#2D4A3E]">Lockin 🔒</Link>
        <Link href="/" className="text-sm text-[#6B7268]">Back</Link>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-8 pb-20">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: "#6B7268" }}>
          Effective date: 1 May 2026 &nbsp;·&nbsp; Last updated: 1 May 2026
        </p>

        <div className="space-y-8" style={{ color: "#1A1F1B", lineHeight: 1.75 }}>
          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>1. Who we are</h2>
            <p>
              Lockin (&quot;we&quot;, &quot;our&quot;, &quot;the service&quot;) is an AI nutrition coaching product accessible via Telegram
              and the web at <strong>lockin.food</strong>. We are an individual developer project based in India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>2. Data we collect</h2>
            <p>When you use Lockin, we collect:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm" style={{ color: "#6B7268" }}>
              <li>Your Telegram chat ID and username (used to identify you)</li>
              <li>Health profile: height, weight, age, sex, goal, activity level</li>
              <li>Dietary preferences, allergies, and dislikes</li>
              <li>Fitness routine and workout schedule</li>
              <li>Budget and cooking preferences</li>
              <li>Pantry items you add manually</li>
              <li>Meal plan history generated for you</li>
              <li>Food logs you submit via Telegram</li>
              <li>Weight logs you submit via /weight command</li>
            </ul>
            <p className="mt-3 text-sm" style={{ color: "#6B7268" }}>
              We do <strong>not</strong> collect payment information, read your other Telegram chats, or access
              your device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>3. How we use your data</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "#6B7268" }}>
              <li>To generate personalised meal plans and macro targets for you</li>
              <li>To provide context to the AI when you send messages in Telegram</li>
              <li>To track your nutrition logs and streak</li>
              <li>To generate shopping lists from your meal plan, subtracting pantry items</li>
              <li>To improve our service (aggregated, de-identified statistics only)</li>
            </ul>
            <p className="mt-3 text-sm" style={{ color: "#6B7268" }}>
              Your health data is never used for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>4. Data storage and security</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "#6B7268" }}>
              <li>Data is stored in Supabase (PostgreSQL) hosted on AWS in the Mumbai region</li>
              <li>All data is encrypted at rest and in transit (SSL/TLS)</li>
              <li>Row Level Security is enabled on all tables</li>
              <li>Only server-side code (running on Vercel) can access your data via the service role key</li>
              <li>The service key is never exposed to the browser</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>5. Third-party services</h2>
            <p className="text-sm mb-2" style={{ color: "#6B7268" }}>We use the following third-party services to operate Lockin:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "#6B7268" }}>
              <li><strong>Google Gemini AI</strong> — generates meal plans and responds to your Telegram messages.
                Your profile summary and today&apos;s plan are sent to Gemini as context. No personal identifiers are
                sent — only nutritional and preference data. Subject to Google&apos;s API terms.</li>
              <li><strong>Telegram</strong> — the primary interface. Telegram processes your messages per their
                privacy policy.</li>
              <li><strong>Vercel</strong> — hosts the web app and API. Vercel may log request metadata.</li>
              <li><strong>Swiggy Instamart</strong> (when enabled) — only your shopping list items (ingredient
                names and quantities) are sent to Swiggy to build a cart. Your health profile, macros, and
                personal data are <strong>never</strong> sent to Swiggy.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>6. Data sharing</h2>
            <p className="text-sm" style={{ color: "#6B7268" }}>
              We do not sell your data. We do not share your data with advertisers. Your data is shared
              with third-party services only as described in Section 5 above, solely for the purpose of
              operating the service for you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>7. Your rights</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "#6B7268" }}>
              <li><strong>Delete your data:</strong> Send /deletedata in Telegram. This permanently and
                irreversibly deletes your profile, meal plans, pantry, shopping lists, and all logs from
                all tables. This cannot be undone.</li>
              <li><strong>Export your data:</strong> Contact us at the email below to request a copy of
                your data in JSON format.</li>
              <li><strong>Correct your data:</strong> Edit your profile at lockin.food/profile or contact us.</li>
            </ul>
            <p className="mt-3 text-sm" style={{ color: "#6B7268" }}>
              These rights are provided in compliance with the{" "}
              <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>8. Age restriction</h2>
            <p className="text-sm" style={{ color: "#6B7268" }}>
              Lockin is intended for users 18 years of age and older. We do not knowingly collect data
              from anyone under 18. If you believe a minor has used Lockin, contact us to have their
              data deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>9. Medical disclaimer</h2>
            <p className="text-sm" style={{ color: "#6B7268" }}>
              Lockin provides general nutrition information and AI-generated meal suggestions. It is not a
              medical device and does not provide medical advice, diagnoses, or treatment recommendations.
              If you have a medical condition, consult a qualified healthcare provider before making
              significant dietary changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>10. Changes to this policy</h2>
            <p className="text-sm" style={{ color: "#6B7268" }}>
              If we make material changes to this policy, we will notify you via the Telegram bot before
              the changes take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif" }}>11. Contact</h2>
            <p className="text-sm" style={{ color: "#6B7268" }}>
              Questions about privacy? Open Telegram and send a message to the bot, or email us at{" "}
              <strong>privacy@lockin.food</strong>.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

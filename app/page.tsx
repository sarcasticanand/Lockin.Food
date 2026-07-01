import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF8F3", color: "#1A1F1B" }}>
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <span
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2D4A3E" }}
        >
          Lockin 🔒
        </span>
        <Link
          href="/onboarding"
          className="text-sm font-medium rounded-full px-4 py-2 transition-colors"
          style={{ color: "#2D4A3E", border: "1px solid #2D4A3E" }}
        >
          Get started
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
        <div
          className="inline-block text-sm font-medium px-4 py-1.5 rounded-full mb-6"
          style={{ backgroundColor: "rgba(45,74,62,0.1)", color: "#2D4A3E" }}
        >
          AI nutrition coaching that actually works
        </div>
        <h1
          className="text-5xl md:text-6xl font-bold leading-tight mb-6"
          style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
        >
          Your nutrition,
          <br />
          <span style={{ color: "#2D4A3E" }}>locked in.</span>
        </h1>
        <p className="text-lg max-w-xl mx-auto mb-10 leading-relaxed" style={{ color: "#6B7268" }}>
          Lockin plans your meals, tracks your macros, and manages your pantry — all in one clean web dashboard. Connect Telegram for daily nudges, or use the web. It works either way.
        </p>
        <div className="flex justify-center">
          <Link
            href="/onboarding"
            className="font-semibold px-8 py-4 rounded-2xl text-base transition-colors text-center"
            style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}
          >
            Set up my profile →
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl font-bold text-center mb-4"
            style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
          >
            How it works
          </h2>
          <p className="text-center mb-14" style={{ color: "#6B7268" }}>Three steps to eating right.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Set your profile",
                desc: "Tell us your goal, body stats, food preferences, allergies, budget, and schedule. Takes 5 minutes.",
                emoji: "📋",
              },
              {
                step: "02",
                title: "Get your plan",
                desc: "We generate a personalised 7-day meal plan with 7 slots per day — macros calculated, recipes included.",
                emoji: "🍱",
              },
              {
                step: "03",
                title: "Daily nudges (optional)",
                desc: "Connect Telegram for daily morning briefings, meal reminders, and check-ins. Or just use the dashboard — it's all there.",
                emoji: "💬",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl p-8"
                style={{ backgroundColor: "#FAF8F3" }}
              >
                <div className="text-4xl mb-4">{item.emoji}</div>
                <div
                  className="text-xs font-bold tracking-widest mb-2 uppercase"
                  style={{ color: "#2D4A3E" }}
                >
                  Step {item.step}
                </div>
                <h3
                  className="text-xl font-bold mb-3"
                  style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
                >
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6B7268" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2
          className="text-3xl font-bold text-center mb-14"
          style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
        >
          Everything your nutrition needs
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: "🎯", title: "Goal-based macros", desc: "Fat loss, muscle gain, clean eating, or condition management. Precise calorie and macro targets." },
            { icon: "🍽️", title: "Composed plates", desc: "Every meal is a full plate — main + carb base + side + accompaniment. Not just a dish name." },
            { icon: "🔄", title: "Smart meal swaps", desc: "Say 'swap my dinner' and get 3 alternatives that fit the same macro slot." },
            { icon: "📊", title: "Macro tracking", desc: "Log what you eat in plain English. Lockin calculates everything and adjusts the rest of your day." },
            { icon: "🛒", title: "Shopping lists", desc: "One-tap grocery list from your meal plan, subtracting what's already in your pantry." },
            { icon: "💪", title: "Workout plans", desc: "Sets, reps, rest times — calibrated to your goal. Cardio days vs strength days sorted." },
            { icon: "🌏", title: "Regional food", desc: "North Indian, South Indian, Bengali, Gujarati, Continental — meals that actually match your kitchen." },
            { icon: "🧘", title: "7-slot day model", desc: "Early morning to pre-bed — every eating window planned so you're never caught hungry." },
            { icon: "🔥", title: "Streak tracking", desc: "Track consistency. A streak is a signal, not a punishment — miss a day and start again." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-1" style={{ color: "#1A1F1B" }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#6B7268" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6" style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}>
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-4xl font-bold mb-4"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            Ready to lock in?
          </h2>
          <p className="text-lg mb-8" style={{ color: "#7BA088" }}>
            Set up your profile in 5 minutes. Your plan is ready the moment you finish.
          </p>
          <Link
            href="/onboarding"
            className="font-semibold px-8 py-4 rounded-2xl text-base transition-colors inline-block"
            style={{ backgroundColor: "#E89B7C", color: "#FFFFFF" }}
          >
            Get started — it&apos;s free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
        style={{ color: "#6B7268" }}
      >
        <span style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, color: "#2D4A3E" }}>
          Lockin 🔒
        </span>
        <div className="flex gap-6">
          <Link href="/privacy" className="transition-colors hover:underline">
            Privacy Policy
          </Link>
          <a
            href="https://t.me/lockinfood_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:underline"
          >
            Telegram Bot
          </a>
        </div>
        <span>© {new Date().getFullYear()} Lockin. For adults 18+.</span>
      </footer>
    </div>
  );
}

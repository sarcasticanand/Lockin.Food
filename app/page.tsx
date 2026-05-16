import Link from 'next/link'
import { ArrowRight, CheckCircle2, Smartphone, Zap, ShoppingCart, BarChart3, Lock } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <span className="font-display font-bold text-2xl text-[#2D4A3E]">Lockin 🔒</span>
        <Link
          href="/onboarding"
          className="text-sm font-medium text-[#2D4A3E] border border-[#2D4A3E] rounded-full px-4 py-2 hover:bg-[#2D4A3E] hover:text-white transition-all duration-200"
        >
          Get started
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-5 pt-16 pb-24 text-center">
        <div className="inline-block text-sm font-medium px-4 py-1.5 rounded-full mb-6 bg-[#2D4A3E]/10 text-[#2D4A3E]">
          AI nutrition coaching · India-first
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-bold text-[#2D4A3E] leading-tight mb-6">
          Your nutrition,<br />locked in.
        </h1>
        <p className="text-lg text-[#6B7268] max-w-xl mx-auto mb-8 leading-relaxed">
          AI-powered meal plans personalised for Indian diets. Macro tracking and daily check-ins on Telegram. Set up in 5 minutes.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 bg-[#E89B7C] text-white px-7 py-3.5 rounded-xl font-medium hover:bg-[#d9845f] active:scale-95 transition-all duration-200"
          >
            Get started — it&apos;s free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://t.me/lockinfood_bot"
            className="inline-flex items-center gap-2 text-[#2D4A3E] border border-[#2D4A3E] px-7 py-3.5 rounded-xl font-medium hover:bg-[#2D4A3E]/5 transition-all duration-200"
          >
            <Smartphone className="w-4 h-4" />
            Open Telegram bot
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-5 py-20 border-t border-[#E8E4DC]">
        <h2 className="font-display text-3xl font-semibold text-center text-[#2D4A3E] mb-2">How it works</h2>
        <p className="text-center text-[#6B7268] mb-12">Three steps. Five minutes. Then it runs itself.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              title: 'Set your profile',
              desc: 'Tell us your goal, body stats, food preferences, and schedule. We calculate your exact macro targets.',
            },
            {
              step: '02',
              title: 'Get your 7-day plan',
              desc: 'Gemini generates a personalised meal plan for your goal, cuisine, budget, and cooking time.',
            },
            {
              step: '03',
              title: 'Daily check-ins on Telegram',
              desc: 'Pre-meal reminders, post-meal confirmations, pantry tracking, and an end-of-day summary — all on Telegram.',
            },
          ].map((item) => (
            <div key={item.step} className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,31,27,0.06)]">
              <div className="font-display text-4xl font-bold text-[#2D4A3E]/20 mb-3">{item.step}</div>
              <h3 className="font-display font-semibold text-lg text-ink mb-2">{item.title}</h3>
              <p className="text-sm text-[#6B7268] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-5 py-20 border-t border-[#E8E4DC]">
        <h2 className="font-display text-3xl font-semibold text-center text-[#2D4A3E] mb-12">Everything in one place</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: 'Personalised meal plans', desc: 'India-specific recipes for your cuisine, budget, and goal.' },
            { icon: BarChart3, title: 'Macro tracking', desc: 'Daily calorie and protein targets with automatic tracking.' },
            { icon: Smartphone, title: 'Telegram daily nudges', desc: '10+ daily messages: reminders, confirmations, summaries.' },
            { icon: ShoppingCart, title: 'Grocery intelligence', desc: 'Auto-generate shopping lists from your weekly plan.' },
            { icon: Lock, title: 'Pantry tracking', desc: 'Know when you\'re running low on ingredients before it\'s too late.' },
            { icon: CheckCircle2, title: 'Weekly progress', desc: 'Track adherence and estimated goal date based on your streak.' },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,31,27,0.06)]">
              <f.icon className="w-5 h-5 text-[#2D4A3E] mb-3" />
              <h3 className="font-medium text-ink mb-1">{f.title}</h3>
              <p className="text-sm text-[#6B7268] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-5 py-20 text-center border-t border-[#E8E4DC]">
        <h2 className="font-display text-4xl font-bold text-[#2D4A3E] mb-4">Ready to get locked in?</h2>
        <p className="text-[#6B7268] mb-8">Free to start. Takes 5 minutes. Your plan is ready instantly.</p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 bg-[#E89B7C] text-white px-8 py-4 rounded-xl font-medium text-lg hover:bg-[#d9845f] active:scale-95 transition-all duration-200"
        >
          Get started — it&apos;s free
          <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E4DC] py-8">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#6B7268]">
          <span className="font-display font-bold text-[#2D4A3E]">Lockin 🔒</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <a href="https://t.me/lockinfood_bot" className="hover:text-ink transition-colors">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

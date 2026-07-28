'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Smartphone, Zap, ShoppingCart, BarChart3, Lock, Camera } from 'lucide-react'
import { waLink, WA_PREFILL } from '@/lib/wa-link'

export default function LandingPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const uid = localStorage.getItem('lockin_uid')
    if (uid) {
      router.replace(`/dashboard?uid=${uid}`)
    } else {
      setReady(true)
    }
  }, [router])

  if (!ready) return null

  return (
    <div className="min-h-screen bg-cream text-ink">
      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-20 max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
        <span className="font-display font-bold text-2xl text-white drop-shadow">Lockin</span>
        <Link
          href="/brand-check"
          className="text-sm font-semibold text-white border border-white/60 rounded-full px-5 py-2 hover:bg-white/20 transition-all duration-200 backdrop-blur-sm"
        >
          Brand check
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background food image */}
        <img
          src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80"
          alt="Healthy food overhead"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.45)]" />

        {/* Hero content */}
        <div className="relative z-10 text-center px-5 max-w-3xl mx-auto">
          <div className="inline-block text-xs font-semibold px-4 py-1.5 rounded-full mb-6 bg-white/15 text-white/90 backdrop-blur-sm border border-white/20">
            AI nutrition coaching · India-first
          </div>
          <h1 className="font-display font-extrabold text-white leading-tight mb-6"
            style={{ fontSize: 'clamp(40px, 6vw, 64px)' }}>
            Your nutrition,<br />locked in.
          </h1>
          <p className="text-[18px] text-white/80 max-w-[480px] mx-auto mb-10 leading-relaxed">
            AI-powered meal plans personalised for Indian diets. Macro tracking and daily check-ins on WhatsApp. Set up in 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center gap-2 bg-[#1A1F1B] text-white px-8 py-4 rounded-full font-semibold text-base hover:bg-[#2D4A3E] active:scale-95 transition-all duration-200"
            >
              Get started — it&apos;s free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={waLink(WA_PREFILL.start)}
              className="inline-flex items-center justify-center gap-2 text-white border border-white/70 px-8 py-4 rounded-full font-semibold text-base hover:bg-white/15 transition-all duration-200 backdrop-blur-sm"
            >
              <Smartphone className="w-4 h-4" />
              Chat on WhatsApp
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-white/50">
          <div className="w-px h-12 bg-gradient-to-b from-transparent to-white/40" />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-5 py-24">
        <h2 className="font-display text-4xl font-bold text-center text-[#1A1F1B] mb-3">How it works</h2>
        <p className="text-center text-[#6B7268] mb-14 text-lg">Three steps. Five minutes. Then it runs itself.</p>
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
              title: 'Daily check-ins on WhatsApp',
              desc: 'Your day plan each morning, a quick check-in after each meal, and an end-of-day summary. Send a photo of any meal to log it.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white p-8 rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
            >
              <div className="font-display text-5xl font-bold text-[#2D4A3E]/15 mb-4">{item.step}</div>
              <h3 className="font-display font-bold text-xl text-[#1A1F1B] mb-3">{item.title}</h3>
              <p className="text-[#6B7268] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-5 py-24">
          <h2 className="font-display text-4xl font-bold text-center text-[#1A1F1B] mb-14">Everything in one place</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[
              { icon: Zap, title: 'Personalised meal plans', desc: 'India-specific recipes for your cuisine, budget, and goal.' },
              { icon: BarChart3, title: 'Macro tracking', desc: 'Daily calorie and protein targets with automatic tracking.' },
              { icon: Smartphone, title: 'WhatsApp check-ins', desc: 'Morning plan, post-meal check-ins, and a nightly summary.' },
              { icon: Camera, title: 'Photo meal logging', desc: 'Snap your plate. We identify the dish and log the macros.' },
              { icon: ShoppingCart, title: 'Grocery intelligence', desc: 'Auto-generate shopping lists from your weekly plan.' },
              { icon: Lock, title: 'Pantry tracking', desc: 'Know when you\'re running low on ingredients before it\'s too late.' },
              { icon: CheckCircle2, title: 'Weekly progress', desc: 'Track adherence and estimated goal date based on your streak.' },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-[#FAF8F3] p-6 rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2D4A3E]/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-[#2D4A3E]" />
                </div>
                <h3 className="font-semibold text-[#1A1F1B] mb-2">{f.title}</h3>
                <p className="text-sm text-[#6B7268] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-5 py-24 text-center">
        <h2 className="font-display text-5xl font-extrabold text-[#1A1F1B] mb-5">Ready to get locked in?</h2>
        <p className="text-[#6B7268] mb-10 text-lg">Free to start. Takes 5 minutes. Your plan is ready instantly.</p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 bg-[#1A1F1B] text-white px-10 py-5 rounded-full font-semibold text-lg hover:bg-[#2D4A3E] active:scale-95 transition-all duration-200"
        >
          Get started — it&apos;s free
          <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E4DC] py-8 bg-white">
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#6B7268]">
          <span className="font-display font-bold text-[#2D4A3E] text-lg">Lockin</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-[#1A1F1B] transition-colors">Privacy</Link>
            <a href={waLink(WA_PREFILL.start)} className="hover:text-[#1A1F1B] transition-colors">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

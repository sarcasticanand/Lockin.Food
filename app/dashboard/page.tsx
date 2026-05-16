'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, Package, Calendar, User, MessageCircle, ChevronRight, Lock } from 'lucide-react'

interface DashboardData {
  user: {
    name?: string
    telegram_username?: string
    telegram_connected: boolean
    current_streak: number
    target_kcal: number
    target_protein_g: number
    target_carbs_g: number
    target_fat_g: number
  }
  todaySlots: Array<{
    slot: string
    time: string
    meal: string
    kcal: number
    protein_g: number
  }> | null
  log: {
    kcal: { current: number; target: number }
    protein: { current: number; target: number }
    carbs: { current: number; target: number }
    fat: { current: number; target: number }
  }
  pantryAlerts: number
}

const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early Morning',
  breakfast: 'Breakfast',
  mid_morning: 'Mid-Morning',
  lunch: 'Lunch',
  evening_snack: 'Evening Snack',
  dinner: 'Dinner',
  pre_bed: 'Pre-Bed',
}

function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#6B7268]">{label}</span>
        <span className="font-medium text-ink">{current} / {target}{label === 'Calories' ? ' kcal' : 'g'}</span>
      </div>
      <Progress value={pct} indicatorClassName={`bg-[${color}]`} className="h-2" style={{ '--tw-bg-opacity': '1' } as React.CSSProperties} />
      <div className="text-xs text-[#6B7268] mt-0.5 text-right">{pct}%</div>
    </div>
  )
}

function DashboardContent() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    fetch(`/api/dashboard?uid=${uid}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [uid])

  if (!uid) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-5">
      <div className="text-center">
        <p className="text-[#6B7268] mb-4">No user ID found.</p>
        <Link href="/onboarding" className="text-[#2D4A3E] font-medium underline">Set up your profile</Link>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#6B7268] text-sm">Loading your plan...</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-5">
      <p className="text-[#6B7268]">Could not load dashboard. <Link href="/onboarding" className="text-[#2D4A3E] underline">Start over</Link></p>
    </div>
  )

  const { user, todaySlots, log, pantryAlerts } = data
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <span className="font-display font-bold text-xl text-[#2D4A3E]">Lockin <Lock className="w-4 h-4 inline" /></span>
          <div className="flex items-center gap-3">
            {user.current_streak > 0 && (
              <Badge variant="sage" className="text-xs">{user.current_streak} day streak</Badge>
            )}
            <Link href={`/profile?uid=${uid}`} className="w-8 h-8 rounded-full bg-[#2D4A3E]/10 flex items-center justify-center">
              <User className="w-4 h-4 text-[#2D4A3E]" />
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {/* Greeting */}
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {greeting}{user.name ? `, ${user.name}` : ''}. {user.current_streak > 0 ? `Day ${user.current_streak}.` : ''}
          </h1>
          <p className="text-[#6B7268] text-sm mt-0.5">
            Target: {user.target_kcal} kcal · {user.target_protein_g}g protein
          </p>
        </div>

        {/* Macro progress */}
        <Card>
          <h2 className="font-medium text-ink mb-4">Today&apos;s progress</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#6B7268]">Calories</span>
                <span className="font-medium text-ink">{log.kcal.current} / {log.kcal.target} kcal</span>
              </div>
              <div className="h-2 bg-[#E8E4DC] rounded-full overflow-hidden">
                <div className="h-full bg-[#2D4A3E] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((log.kcal.current / log.kcal.target) * 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#6B7268]">Protein</span>
                <span className="font-medium text-ink">{log.protein.current}g / {log.protein.target}g</span>
              </div>
              <div className="h-2 bg-[#E8E4DC] rounded-full overflow-hidden">
                <div className="h-full bg-[#7BA088] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((log.protein.current / log.protein.target) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
        </Card>

        {/* Today's meals */}
        <div>
          <h2 className="font-display font-semibold text-lg text-ink mb-3">Today&apos;s meals</h2>
          {todaySlots && todaySlots.length > 0 ? (
            <div className="space-y-2">
              {todaySlots.map((slot) => (
                <div key={slot.slot} className="bg-white rounded-xl p-4 border border-[#E8E4DC] flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#5A7A6B] mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#6B7268] shrink-0">{slot.time} · {SLOT_LABELS[slot.slot] || slot.slot}</span>
                    </div>
                    <p className="text-sm font-medium text-ink mt-0.5 leading-snug">{slot.meal}</p>
                    {(slot.kcal > 0 || slot.protein_g > 0) && (
                      <p className="text-xs text-[#6B7268] mt-1">{slot.kcal} kcal · {slot.protein_g}g protein</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 border border-[#E8E4DC] text-center">
              <p className="text-[#6B7268] text-sm mb-3">No meal plan yet.</p>
              <Link href={`/plan?uid=${uid}`} className="text-[#2D4A3E] text-sm font-medium underline">Generate your plan</Link>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: `/plan?uid=${uid}`, icon: Calendar, label: 'Full week plan', sub: '7-day view' },
            { href: `/shop?uid=${uid}`, icon: ShoppingCart, label: 'Shopping list', sub: 'Generate from plan' },
            { href: `/pantry?uid=${uid}`, icon: Package, label: 'Pantry', sub: pantryAlerts > 0 ? `${pantryAlerts} items low` : 'Track groceries' },
            { href: `/progress?uid=${uid}`, icon: User, label: 'Progress', sub: 'Charts & streak' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="bg-white rounded-xl p-4 border border-[#E8E4DC] hover:border-[#2D4A3E]/30 transition-colors flex items-center gap-3">
              <item.icon className="w-5 h-5 text-[#2D4A3E] shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink">{item.label}</div>
                <div className={`text-xs ${pantryAlerts > 0 && item.label === 'Pantry' ? 'text-[#D4A574]' : 'text-[#6B7268]'}`}>{item.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Telegram connect */}
        {!user.telegram_connected ? (
          <Card className="border border-[#2D4A3E]/20 bg-[#2D4A3E]/5">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-[#2D4A3E] shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-ink mb-1">Connect Telegram for daily reminders</h3>
                <p className="text-sm text-[#6B7268] mb-3">Get pre-meal nudges, post-meal tracking, and your daily summary — all on Telegram.</p>
                <a href="https://t.me/lockinfood_bot"
                  className="inline-flex items-center gap-1.5 bg-[#2D4A3E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#243d32] transition-colors">
                  Open Telegram bot <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[#7BA088] bg-[#7BA088]/10 rounded-xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-[#7BA088]" />
            Telegram connected. Daily messages active.
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}

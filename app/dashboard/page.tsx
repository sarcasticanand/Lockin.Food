'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, ChevronRight, Lock } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

const RadialBarChart = dynamic(
  () => import('recharts').then(m => m.RadialBarChart),
  { ssr: false }
)
const RadialBar = dynamic(
  () => import('recharts').then(m => m.RadialBar),
  { ssr: false }
)
const ResponsiveContainer = dynamic(
  () => import('recharts').then(m => m.ResponsiveContainer),
  { ssr: false }
)

interface DashboardData {
  user: {
    name?: string
    telegram_username?: string
    telegram_connected: boolean
    link_token?: string | null
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
  eatenSlots: string[]
  skippedSlots: string[]
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

interface Alternative {
  meal: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  reason: string
}

function TodayMealCard({ slot, uid, status, onChanged }: {
  slot: NonNullable<DashboardData['todaySlots']>[number]
  uid: string
  status: 'pending' | 'eaten' | 'skipped'
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null)
  const [swapError, setSwapError] = useState('')

  async function logMeal(action: 'eaten' | 'skipped') {
    setBusy(true)
    try {
      await fetch('/api/log-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, slot: slot.slot, action }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function loadAlternatives() {
    setBusy(true)
    setSwapError('')
    try {
      const res = await fetch('/api/swap-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, dayIndex: new Date().getDay(), slot: slot.slot }),
      })
      const d = await res.json()
      if (!res.ok || !d.alternatives?.length) {
        setSwapError('Could not load alternatives. Try again.')
      } else {
        setAlternatives(d.alternatives)
      }
    } catch {
      setSwapError('Could not load alternatives. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function applySwap(alt: Alternative) {
    setBusy(true)
    try {
      await fetch('/api/swap-meal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, dayIndex: new Date().getDay(), slot: slot.slot, alternative: alt }),
      })
      setAlternatives(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`bg-white rounded-[16px] p-4 shadow-[0_2px_16px_rgba(0,0,0,0.06)] ${status === 'skipped' ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${status === 'eaten' ? 'bg-[#7BA088]' : 'bg-[#5A7A6B]'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#6B7268] shrink-0">{slot.time} · {SLOT_LABELS[slot.slot] || slot.slot}</span>
            {status === 'eaten' && <Badge variant="sage" className="text-xs shrink-0">Eaten ✓</Badge>}
            {status === 'skipped' && <span className="text-xs text-[#6B7268] shrink-0">Skipped</span>}
          </div>
          <p className={`text-sm font-medium text-ink mt-0.5 leading-snug ${status === 'skipped' ? 'line-through' : ''}`}>{slot.meal}</p>
          {(slot.kcal > 0 || slot.protein_g > 0) && (
            <p className="text-xs text-[#6B7268] mt-1">{slot.kcal} kcal · {slot.protein_g}g protein</p>
          )}

          {status === 'pending' && !alternatives && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => logMeal('eaten')} disabled={busy}
                className="flex-1 py-1.5 rounded-full text-xs font-semibold bg-[#2D4A3E] text-white hover:bg-[#1A1F1B] transition-colors disabled:opacity-50">
                Eaten ✓
              </button>
              <button onClick={loadAlternatives} disabled={busy}
                className="flex-1 py-1.5 rounded-full text-xs font-medium border border-[#E8E4DC] text-[#6B7268] hover:border-[#2D4A3E] hover:text-[#2D4A3E] transition-colors disabled:opacity-50">
                {busy ? 'Loading…' : 'Swap'}
              </button>
              <button onClick={() => logMeal('skipped')} disabled={busy}
                className="px-4 py-1.5 rounded-full text-xs font-medium border border-[#E8E4DC] text-[#6B7268] hover:text-ink transition-colors disabled:opacity-50">
                Skip
              </button>
            </div>
          )}
          {swapError && <p className="text-xs text-red-500 mt-2">{swapError}</p>}

          {alternatives && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-[#2D4A3E]">Pick an alternative:</p>
              {alternatives.map((alt, i) => (
                <button key={i} onClick={() => applySwap(alt)} disabled={busy}
                  className="w-full text-left px-3 py-2.5 rounded-[12px] border border-[#E8E4DC] hover:border-[#2D4A3E] transition-colors disabled:opacity-50">
                  <span className="text-sm font-medium text-ink block">{alt.meal}</span>
                  <span className="text-xs text-[#6B7268]">{alt.kcal} kcal · {alt.protein_g}g protein — {alt.reason}</span>
                </button>
              ))}
              <button onClick={() => setAlternatives(null)} className="text-xs text-[#6B7268] underline">Keep current meal</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardContent() {
  const params = useSearchParams()
  const uid = params.get('uid') || (typeof window !== 'undefined' ? localStorage.getItem('lockin_uid') : null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [planError, setPlanError] = useState('')

  useEffect(() => {
    if (!uid) return
    fetch(`/api/dashboard?uid=${uid}`)
      .then(r => r.json())
      .then(async (d) => {
        setData(d)
        if (!d.todaySlots) {
          setGeneratingPlan(true)
          try {
            const res = await fetch('/api/generate-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: uid }),
            })
            const result = await res.json()
            if (!res.ok) {
              setPlanError(result.error || 'Failed to generate plan')
            } else {
              const updated = await fetch(`/api/dashboard?uid=${uid}`).then(r => r.json())
              setData(updated)
            }
          } catch {
            setPlanError('Could not reach plan generation service')
          } finally {
            setGeneratingPlan(false)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [uid])

  async function refresh() {
    if (!uid) return
    try {
      const d = await fetch(`/api/dashboard?uid=${uid}`).then(r => r.json())
      setData(d)
    } catch { /* keep showing current data */ }
  }

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

  if (generatingPlan) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center px-6">
        <div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="font-medium text-ink mb-1">Generating your 7-day meal plan...</p>
        <p className="text-[#6B7268] text-sm">This takes about 15–30 seconds</p>
        {planError && <p className="text-red-500 text-sm mt-3">{planError}</p>}
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-5">
      <p className="text-[#6B7268]">Could not load dashboard. <Link href="/onboarding" className="text-[#2D4A3E] underline">Start over</Link></p>
    </div>
  )

  const { user, todaySlots, log, pantryAlerts } = data
  const eatenSlots = data.eatenSlots || []
  const skippedSlots = data.skippedSlots || []
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const kcalPct = log.kcal.target > 0 ? Math.min(Math.round((log.kcal.current / log.kcal.target) * 100), 100) : 0
  const ringData = [
    { value: 100, fill: '#E8E4DC' },
    { value: kcalPct, fill: '#2D4A3E' },
  ]

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
              <span className="text-xs font-semibold text-[#2D4A3E]">{user.name ? user.name[0].toUpperCase() : 'U'}</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5 pb-safe">
        {/* Greeting */}
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {greeting}{user.name ? `, ${user.name}` : ''}. {user.current_streak > 0 ? `Day ${user.current_streak}.` : ''}
          </h1>
          <p className="text-[#6B7268] text-sm mt-0.5">
            Target: {user.target_kcal} kcal · {user.target_protein_g}g protein
          </p>
        </div>

        {/* Macro ring */}
        <Card>
          <h2 className="font-medium text-ink mb-4">Today&apos;s progress</h2>
          <div className="relative w-48 h-48 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="90%" data={ringData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={8} background={false} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display text-3xl font-bold text-ink">{log.kcal.current}</div>
              <div className="text-xs text-[#6B7268]">of {log.kcal.target} kcal</div>
              <div className="text-sm font-semibold text-[#2D4A3E] mt-1">{kcalPct}%</div>
            </div>
          </div>
          {/* Macro pills */}
          <div className="flex justify-center gap-3 mt-4">
            {[
              { label: 'Protein', value: log.protein.current, unit: 'g' },
              { label: 'Carbs', value: log.carbs.current, unit: 'g' },
              { label: 'Fat', value: log.fat.current, unit: 'g' },
            ].map(m => (
              <div key={m.label} className="bg-[#F5F3EE] rounded-full px-3 py-1.5 text-center">
                <div className="text-xs text-[#6B7268]">{m.label}</div>
                <div className="text-sm font-semibold text-ink">{m.value}{m.unit}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Today's meals */}
        <div>
          <h2 className="font-display font-semibold text-lg text-ink mb-3">Today&apos;s meals</h2>
          {todaySlots && todaySlots.length > 0 ? (
            <div className="space-y-2">
              {todaySlots.map((slot) => (
                <TodayMealCard
                  key={slot.slot}
                  slot={slot}
                  uid={uid}
                  status={eatenSlots.includes(slot.slot) ? 'eaten' : skippedSlots.includes(slot.slot) ? 'skipped' : 'pending'}
                  onChanged={refresh}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-[16px] p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] text-center">
              <p className="text-[#6B7268] text-sm mb-3">No meal plan yet.</p>
              <Link href={`/plan?uid=${uid}`} className="text-[#2D4A3E] text-sm font-medium underline">Generate your plan</Link>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: `/plan?uid=${uid}`, label: 'Full week plan', sub: '7-day view', emoji: '📅' },
            { href: `/shop?uid=${uid}`, label: 'Shopping list', sub: 'Generate from plan', emoji: '🛒' },
            { href: `/pantry?uid=${uid}`, label: 'Pantry', sub: pantryAlerts > 0 ? `${pantryAlerts} items low` : 'Track groceries', emoji: '📦' },
            { href: `/progress?uid=${uid}`, label: 'Progress', sub: 'Charts & streak', emoji: '📊' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="bg-white rounded-[16px] p-4 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.10)] transition-shadow flex items-center gap-3">
              <span className="text-xl shrink-0">{item.emoji}</span>
              <div className="min-w-0">
                <div className="font-medium text-sm text-ink">{item.label}</div>
                <div className={`text-xs ${pantryAlerts > 0 && item.label === 'Pantry' ? 'text-[#D4A574]' : 'text-[#6B7268]'}`}>{item.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Telegram connect */}
        {!user.telegram_connected ? (
          <Card className="bg-[#2D4A3E]/5 border border-[#2D4A3E]/20">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-[#2D4A3E] shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-ink mb-1">Activate your daily meal messages</h3>
                <p className="text-sm text-[#6B7268] mb-2">Send <span className="font-semibold text-ink">/start</span> to the bot on Telegram. It will recognise your account and send your welcome message + today&apos;s plan right away.</p>
                <p className="text-xs text-[#6B7268] mb-3">After that you&apos;ll get meal reminders, post-meal check-ins, and a daily recap.</p>
                <a href={user.link_token ? `https://t.me/lockinfood_bot?start=${user.link_token}` : 'https://t.me/lockinfood_bot'}
                  className="inline-flex items-center gap-1.5 bg-[#1A1F1B] text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-[#2D4A3E] transition-colors">
                  Open @lockinfood_bot <ChevronRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[#7BA088] bg-[#7BA088]/10 rounded-[16px] px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-[#7BA088]" />
            Telegram connected. Daily messages active.
          </div>
        )}
      </div>

      <BottomNav uid={uid} />
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

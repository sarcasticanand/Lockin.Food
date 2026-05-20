'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import BottomNav from '@/components/BottomNav'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOT_LABELS: Record<string, string> = {
  early_morning: 'Early Morning',
  breakfast: 'Breakfast',
  mid_morning: 'Mid-Morning',
  lunch: 'Lunch',
  evening_snack: 'Evening Snack',
  dinner: 'Dinner',
  pre_bed: 'Pre-Bed',
}

interface DayPlan {
  day_index?: number
  day_name?: string
  is_workout_day?: boolean
  total_kcal?: number
  slots: Array<{
    slot: string
    time: string
    meal: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    ingredients?: string[]
  }>
}

function MealCard({ slot }: { slot: DayPlan['slots'][number] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
      <button className="w-full p-4 text-left flex items-start gap-3" onClick={() => setExpanded(e => !e)}>
        <div className="w-2 h-2 rounded-full bg-[#5A7A6B] mt-2 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#6B7268] mb-0.5">{slot.time} · {SLOT_LABELS[slot.slot] || slot.slot}</div>
          <p className="text-sm font-medium text-ink leading-snug">{slot.meal}</p>
          <p className="text-xs text-[#6B7268] mt-1">{slot.kcal} kcal · {slot.protein_g}g protein</p>
        </div>
        {slot.ingredients && slot.ingredients.length > 0 && (
          expanded ? <ChevronUp className="w-4 h-4 text-[#6B7268] shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-[#6B7268] shrink-0 mt-1" />
        )}
      </button>
      {expanded && slot.ingredients && (
        <div className="px-4 pb-4 pt-0 border-t border-[#F0EDE6]">
          <div className="text-xs font-medium text-[#6B7268] mb-2 mt-3">Ingredients</div>
          <div className="flex flex-wrap gap-1.5">
            {slot.ingredients.map((ing, i) => (
              <span key={i} className="text-xs bg-[#F0EDE6] text-[#6B7268] px-2 py-0.5 rounded-full">{ing}</span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['Protein', slot.protein_g, 'g'], ['Carbs', slot.carbs_g, 'g'], ['Fat', slot.fat_g, 'g']].map(([l, v, u]) => (
              <div key={String(l)} className="bg-[#F5F3EE] rounded-[16px] p-2">
                <div className="text-xs text-[#6B7268]">{l}</div>
                <div className="font-medium text-ink text-sm">{v}{u}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlanContent() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const [days, setDays] = useState<DayPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(String(new Date().getDay()))

  useEffect(() => {
    if (!uid) return
    fetch(`/api/plan?uid=${uid}`)
      .then(r => r.json())
      .then(d => setDays(d.days || []))
      .finally(() => setLoading(false))
  }, [uid])

  if (!uid) return <div className="p-5 text-[#6B7268]">No user ID.</div>
  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const activeIndex = parseInt(activeDay, 10)
  const activeData = days.find(d => String(d.day_index ?? days.indexOf(d)) === activeDay)

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href={`/dashboard?uid=${uid}`} className="text-[#6B7268] hover:text-ink"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-display font-semibold text-lg text-ink">7-Day Plan</h1>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-safe">
        {days.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#6B7268] mb-4">No plan generated yet.</p>
            <Link href={`/dashboard?uid=${uid}`} className="text-[#2D4A3E] font-medium underline">Back to dashboard</Link>
          </div>
        ) : (
          <>
            {/* Pill day tabs */}
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mb-6">
              {days.map((day, i) => {
                const dayIdx = String(day.day_index ?? i)
                const isActive = activeDay === dayIdx
                return (
                  <button
                    key={i}
                    onClick={() => setActiveDay(dayIdx)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#2D4A3E] text-white'
                        : 'bg-white text-[#6B7268] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                    }`}
                  >
                    {DAYS_SHORT[day.day_index ?? i] || `D${i + 1}`}
                  </button>
                )
              })}
            </div>

            {activeData && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display font-semibold text-lg text-ink">{activeData.day_name || DAYS_SHORT[activeIndex]}</h2>
                    <p className="text-sm text-[#6B7268]">{activeData.total_kcal} kcal target</p>
                  </div>
                  {activeData.is_workout_day && <Badge variant="sage">Workout day</Badge>}
                </div>
                <div className="space-y-2">
                  {(activeData.slots || []).map((slot, j) => (
                    <MealCard key={j} slot={slot} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <BottomNav uid={uid} />
    </div>
  )
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>}>
      <PlanContent />
    </Suspense>
  )
}

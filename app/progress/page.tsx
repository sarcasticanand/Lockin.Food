'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function ProgressContent() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const [user, setUser] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!uid) return
    fetch(`/api/profile?uid=${uid}`).then(r => r.json()).then(d => setUser(d.user))
  }, [uid])

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href={`/dashboard?uid=${uid}`} className="text-[#6B7268] hover:text-ink"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-display font-semibold text-lg text-ink">Progress</h1>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {user && (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2D4A3E]/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#2D4A3E]" />
                </div>
                <div>
                  <div className="font-medium text-ink">Streak</div>
                  <div className="font-display text-2xl font-bold text-[#2D4A3E]">{(user.current_streak as number) || 0} days</div>
                </div>
                {((user.current_streak as number) || 0) > 0 && <Badge variant="sage" className="ml-auto">Active</Badge>}
              </div>
            </Card>

            <Card>
              <h3 className="font-medium text-ink mb-3">Daily targets</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Calories', val: user.target_kcal, unit: 'kcal' },
                  { label: 'Protein', val: user.target_protein_g, unit: 'g' },
                  { label: 'Carbs', val: user.target_carbs_g, unit: 'g' },
                  { label: 'Fat', val: user.target_fat_g, unit: 'g' },
                ].map(t => (
                  <div key={t.label} className="bg-[#F5F3EE] rounded-xl p-3">
                    <div className="text-xs text-[#6B7268]">{t.label}</div>
                    <div className="font-display font-bold text-lg text-ink mt-0.5">{(t.val as number) || '--'} {t.unit}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="font-medium text-ink mb-1">Goal</h3>
              <p className="text-sm text-[#6B7268] capitalize">{(user.goal as string)?.replace('_', ' ') || 'Not set'}</p>
              {!!user.weight_kg && !!user.target_kg && (
                <div className="mt-3 text-sm text-ink">
                  Current: <strong>{user.weight_kg as number} kg</strong> &rarr; Goal: <strong>{(user.weight_kg as number) - (user.target_kg as number)} kg</strong>
                </div>
              )}
            </Card>
          </>
        )}

        <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 text-center">
          <p className="text-[#6B7268] text-sm">Full progress charts (weight trend, weekly macro adherence) coming soon.</p>
          <p className="text-xs text-[#6B7268] mt-1">Log your weight daily via Telegram to start tracking.</p>
        </div>
      </div>
    </div>
  )
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>}>
      <ProgressContent />
    </Suspense>
  )
}

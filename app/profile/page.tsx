'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { calculateMacros } from '@/lib/macro-calculator'
import type { Goal, Sex, ActivityLevel } from '@/types'
import BottomNav from '@/components/BottomNav'

const PLAN_FIELDS = new Set([
  'height_cm', 'weight_kg', 'age', 'sex', 'activity_level', 'goal',
  'condition', 'target_kg', 'target_weeks',
  'okay_with_dairy', 'okay_with_eggs', 'okay_with_meat_fish',
  'food_style', 'food_style_notes', 'allergies', 'dislikes', 'dislikes_notes',
  'works_out', 'workout_type', 'workout_days', 'workout_time',
  'region', 'budget_weekly', 'max_cooking_time', 'wake_time', 'sleep_time', 'meal_preps',
])

function ProfileContent() {
  const params = useSearchParams()
  const uid = params.get('uid') || (typeof window !== 'undefined' ? localStorage.getItem('lockin_uid') : null)
  const [user, setUser] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [originalUser, setOriginalUser] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!uid) return
    fetch(`/api/profile?uid=${uid}`).then(r => r.json()).then(d => {
      setUser(d.user)
      setOriginalUser(d.user)
    })
  }, [uid])

  const set = (key: string, val: unknown) => setUser(u => u ? { ...u, [key]: val } : u)

  const save = async () => {
    if (!uid || !user) return
    setSaving(true)
    const macros = user.height_cm && user.weight_kg && user.age && user.sex && user.activity_level && user.goal
      ? calculateMacros({
          height_cm: Number(user.height_cm), weight_kg: Number(user.weight_kg), age: Number(user.age),
          sex: user.sex as Sex, activity_level: user.activity_level as ActivityLevel, goal: user.goal as Goal,
          condition: (user.condition as string) || undefined,
          target_kg: user.target_kg ? Number(user.target_kg) : undefined,
          target_weeks: user.target_weeks ? Number(user.target_weeks) : undefined,
        })
      : null
    const macroFields = macros ? { bmi: macros.bmi, bmr: macros.bmr, tdee: macros.tdee, target_kcal: macros.target_kcal, target_protein_g: macros.target_protein_g, target_carbs_g: macros.target_carbs_g, target_fat_g: macros.target_fat_g } : {}
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, ...user, ...macroFields }),
    })
    setUser(prev => prev ? { ...prev, ...macroFields } : prev)

    const planFieldChanged = originalUser && [...PLAN_FIELDS].some(f => JSON.stringify(user[f]) !== JSON.stringify(originalUser[f]))
    if (planFieldChanged) {
      setRegenerating(true)
      try {
        await fetch('/api/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        })
      } catch { /* plan regen is best-effort */ }
      setRegenerating(false)
    }

    setOriginalUser({ ...user, ...macroFields })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!user) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href={`/dashboard?uid=${uid}`} className="text-[#6B7268] hover:text-ink"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-display font-semibold text-lg text-ink flex-1">Profile</h1>
          <Button size="sm" onClick={save} disabled={saving || regenerating} className="gap-1.5">
            {saving || regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {regenerating ? 'Updating plan...' : saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-safe space-y-6">
        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Basic Info</h2>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Name</Label>
              <Input value={(user.name as string) || ''} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Phone</Label>
              <Input value={(user.phone_number as string) || ''} onChange={e => set('phone_number', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Telegram username</Label>
              <Input value={(user.telegram_username as string) || ''} onChange={e => set('telegram_username', e.target.value)} placeholder="@username" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Goal</h2>
          <div className="grid grid-cols-2 gap-2">
            {([
              { val: 'fat_loss', label: 'Fat Loss' },
              { val: 'muscle_gain', label: 'Muscle Gain' },
              { val: 'clean_eating', label: 'Clean Eating' },
              { val: 'manage_condition', label: 'Manage Condition' },
            ] as { val: Goal; label: string }[]).map(g => (
              <button key={g.val} onClick={() => set('goal', g.val)}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${user.goal === g.val ? 'border-[#2D4A3E] bg-[#2D4A3E]/5 text-ink' : 'border-[#E8E4DC] bg-white text-[#6B7268] hover:border-[#2D4A3E]/30'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Body Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'height_cm', label: 'Height (cm)' },
              { key: 'weight_kg', label: 'Weight (kg)' },
              { key: 'age', label: 'Age' },
            ].map(f => (
              <div key={f.key}>
                <Label className="mb-1.5 block">{f.label}</Label>
                <Input type="number" value={(user[f.key] as number) || ''} onChange={e => set(f.key, Number(e.target.value))} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Label className="mb-1.5 block">Sex</Label>
              <div className="flex gap-2">
                {(['male', 'female'] as Sex[]).map(s => (
                  <button key={s} onClick={() => set('sex', s)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${user.sex === s ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Activity Level</Label>
              <select
                value={(user.activity_level as string) || ''}
                onChange={e => set('activity_level', e.target.value)}
                className="w-full h-10 rounded-xl border border-[#D8D4CC] bg-white px-3 text-sm text-ink">
                <option value="sedentary">Sedentary</option>
                <option value="light">Lightly Active</option>
                <option value="active">Active</option>
                <option value="very_active">Very Active</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Schedule</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Wake time</Label>
              <Input type="time" value={(user.wake_time as string) || '07:00'} onChange={e => set('wake_time', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Sleep time</Label>
              <Input type="time" value={(user.sleep_time as string) || '23:00'} onChange={e => set('sleep_time', e.target.value)} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Diet Preferences</h2>
          <div className="space-y-3">
            {[
              { key: 'okay_with_dairy', label: 'Okay with dairy' },
              { key: 'okay_with_eggs', label: 'Okay with eggs' },
              { key: 'okay_with_meat_fish', label: 'Okay with meat and fish' },
            ].map(pref => (
              <div key={pref.key} className="flex items-center justify-between bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4">
                <span className="text-sm font-medium text-ink">{pref.label}</span>
                <Switch checked={!!user[pref.key]} onCheckedChange={v => set(pref.key, v)} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold text-base text-ink mb-3">Meal Calendar</h2>
          <div className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4">
            <p className="text-sm text-[#6B7268] mb-3">
              Get today&apos;s and tomorrow&apos;s meals in Google or Apple Calendar with reminders — updates automatically when your plan changes.
            </p>
            <Link href={`/cal/${uid}`}>
              <Button size="sm" className="w-full">🗓 Add to my calendar</Button>
            </Link>
          </div>
        </section>

        {!!user.target_kcal && (
          <section>
            <h2 className="font-display font-semibold text-base text-ink mb-3">Current Targets</h2>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Calories', val: user.target_kcal as number, unit: 'kcal' },
                { label: 'Protein', val: user.target_protein_g as number, unit: 'g' },
                { label: 'Carbs', val: user.target_carbs_g as number, unit: 'g' },
                { label: 'Fat', val: user.target_fat_g as number, unit: 'g' },
              ] as { label: string; val: number; unit: string }[]).map(t => (
                <div key={t.label} className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4">
                  <div className="text-xs text-[#6B7268]">{t.label}</div>
                  <div className="font-display font-bold text-xl text-ink mt-0.5">{t.val}{t.unit}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#6B7268] mt-2">Targets recalculate automatically when you save body stats.</p>
          </section>
        )}
      </div>

      <BottomNav uid={uid} />
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>}>
      <ProfileContent />
    </Suspense>
  )
}

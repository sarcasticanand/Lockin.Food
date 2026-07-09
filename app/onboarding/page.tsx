'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { calculateMacros, getBMILabel, getWeeklyRateLabel } from '@/lib/macro-calculator'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import type { Goal, Sex, ActivityLevel, CookingTime } from '@/types'

const TOTAL_STEPS = 10

interface FormData {
  goal: Goal | ''
  condition: string
  target_kg: number
  target_weeks: number
  condition_notes: string
  height_cm: number
  weight_kg: number
  age: number
  sex: Sex | ''
  activity_level: ActivityLevel | ''
  works_out: boolean
  workout_type: string[]
  workout_days: string[]
  workout_time: string
  okay_with_dairy: boolean
  okay_with_eggs: boolean
  okay_with_meat_fish: boolean
  food_style_notes: string
  food_style: string[]
  allergies: string[]
  dislikes: string[]
  dislikes_notes: string
  budget_weekly: number
  max_cooking_time: CookingTime | ''
  meal_preps: boolean
  wake_time: string
  sleep_time: string
  name: string
  phone_number: string
  telegram_username: string
  messaging_mode: 'full' | 'summary'
}

const INITIAL: FormData = {
  goal: '', condition: '', target_kg: 5, target_weeks: 12, condition_notes: '',
  height_cm: 170, weight_kg: 70, age: 25, sex: '',
  activity_level: '', works_out: false, workout_type: [], workout_days: [], workout_time: '',
  okay_with_dairy: true, okay_with_eggs: true, okay_with_meat_fish: true,
  food_style_notes: '', food_style: [],
  allergies: [], dislikes: [], dislikes_notes: '',
  budget_weekly: 2000, max_cooking_time: '', meal_preps: false,
  wake_time: '07:00', sleep_time: '23:00', name: '', phone_number: '', telegram_username: '',
  messaging_mode: 'full' as const,
}

const WORKOUT_TYPES = ['Gym / Weight Training', 'Running / Cardio', 'Yoga / Pilates', 'Swimming', 'Sports', 'Walking']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_MAP: Record<string, string> = { Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday', Sun: 'sunday' }
const FOOD_CHIPS = ['North Indian', 'South Indian', 'Bengali', 'Gujarati', 'Continental', 'Chinese/Asian', 'Mixed']
const ALLERGY_CHIPS = ['Peanuts', 'Gluten', 'Soy', 'Shellfish', 'Lactose', 'Tree nuts']
const DISLIKE_CHIPS = ['Mushrooms', 'Bitter gourd', 'Brinjal', 'Okra', 'Seafood', 'Beetroot']

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').slice(-10)
}

function isValidIndianPhone(input: string): boolean {
  const n = normalizePhone(input)
  return n.length === 10 && /^[6-9]/.test(n)
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [planReady, setPlanReady] = useState(false)
  const [linkToken, setLinkToken] = useState('')
  const [savedUserId, setSavedUserId] = useState('')

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const macros = useMemo(() => {
    if (!form.height_cm || !form.weight_kg || !form.age || !form.sex || !form.activity_level || !form.goal) return null
    return calculateMacros({
      height_cm: form.height_cm, weight_kg: form.weight_kg, age: form.age,
      sex: form.sex as Sex, activity_level: form.activity_level as ActivityLevel,
      goal: form.goal as Goal, condition: form.condition, target_kg: form.target_kg, target_weeks: form.target_weeks,
    })
  }, [form.height_cm, form.weight_kg, form.age, form.sex, form.activity_level, form.goal, form.condition, form.target_kg, form.target_weeks])

  const canProceed = (): boolean => {
    if (step === 1) return !!form.goal
    if (step === 3) return !!form.height_cm && !!form.weight_kg && !!form.age && !!form.sex
    if (step === 4) return !!form.activity_level
    if (step === 9) return !!form.name && isValidIndianPhone(form.phone_number)
    return true
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const phone = normalizePhone(form.phone_number)
      const payload = {
        name: form.name,
        phone_number: phone,
        telegram_username: form.telegram_username.replace('@', '') || null,
        goal: form.goal, condition: form.condition || null, condition_notes: form.condition_notes || null,
        target_kg: form.target_kg || null, target_weeks: form.target_weeks || null,
        height_cm: form.height_cm, weight_kg: form.weight_kg, age: form.age, sex: form.sex,
        activity_level: form.activity_level,
        okay_with_dairy: form.okay_with_dairy, okay_with_eggs: form.okay_with_eggs, okay_with_meat_fish: form.okay_with_meat_fish,
        food_style: form.food_style, food_style_notes: form.food_style_notes || null,
        allergies: form.allergies, dislikes: form.dislikes, dislikes_notes: form.dislikes_notes || null,
        works_out: form.works_out,
        workout_type: form.workout_type.join(', ') || null,
        workout_days: form.workout_days, workout_time: form.workout_time || null,
        budget_weekly: form.budget_weekly, max_cooking_time: form.max_cooking_time || null, meal_preps: form.meal_preps,
        wake_time: form.wake_time, sleep_time: form.sleep_time,
        messaging_mode: form.messaging_mode,
        onboarding_complete: true,
        ...(macros ? {
          bmi: macros.bmi, bmr: macros.bmr, tdee: macros.tdee,
          target_kcal: macros.target_kcal, target_protein_g: macros.target_protein_g,
          target_carbs_g: macros.target_carbs_g, target_fat_g: macros.target_fat_g,
        } : {}),
      }

      const res = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const resText = await res.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(resText) } catch { throw new Error(`Onboarding failed (${res.status}): ${resText.slice(0, 120)}`) }
      if (!res.ok) throw new Error((data.error as string) || 'Failed to save')

      setLoadingMessage('Generating your personalised meal plan with AI...')
      const planRes = await fetch('/api/generate-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.userId }),
      })
      const planText = await planRes.text()
      let planData: Record<string, unknown>
      try { planData = JSON.parse(planText) } catch { throw new Error(`Plan generation failed (${planRes.status}): ${planText.slice(0, 120)}`) }
      if (!planRes.ok) throw new Error((planData.error as string) || 'Plan generation failed')

      setSavedUserId(data.userId as string)
      setLinkToken((data.linkToken as string) || '')
      setPlanReady(true)
      setLoadingMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const bmiInfo = macros ? getBMILabel(macros.bmi) : null

  if (planReady) return (
    <div className="min-h-screen bg-[#2D4A3E] flex flex-col items-center justify-center px-6 text-white">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="font-display text-2xl font-bold mb-2 text-center">Your plan is ready!</h2>
      <p className="text-white/70 text-center text-sm max-w-xs mb-8">7 days of personalised Indian meals, locked in.</p>

      <div className="w-full max-w-xs space-y-3">
        <p className="text-white/80 text-sm text-center mb-1">Get daily reminders on Telegram:</p>
        <a
          href={linkToken ? `https://t.me/lockinfood_bot?start=${linkToken}` : 'https://t.me/lockinfood_bot'}
          className="flex items-center justify-center gap-2 w-full bg-white text-[#2D4A3E] font-semibold py-3 rounded-2xl text-sm hover:bg-white/90 transition-colors"
        >
          Open @lockinfood_bot →
        </a>
        <button
          onClick={() => router.push(`/dashboard?uid=${savedUserId}`)}
          className="w-full text-white/50 text-xs py-2 text-center hover:text-white/80 transition-colors"
        >
          Skip for now — go to dashboard
        </button>
      </div>
    </div>
  )

  if (loadingMessage) return (
    <div className="min-h-screen bg-[#2D4A3E] flex flex-col items-center justify-center px-6 text-white">
      <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin mb-6" />
      <h2 className="font-display text-2xl font-bold mb-2 text-center">Building your plan</h2>
      <p className="text-white/70 text-center text-sm max-w-xs">{loadingMessage}</p>
      <p className="text-white/40 text-xs mt-4">This takes 15–30 seconds</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-cream">
      <div className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-4">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="text-[#6B7268] hover:text-ink transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1 flex gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{ backgroundColor: i < step ? '#2D4A3E' : '#E8E4DC' }} />
            ))}
          </div>
          <span className="text-xs text-[#6B7268] font-medium">{step}/{TOTAL_STEPS}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-8">

        {step === 1 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">What do you want to achieve?</h2>
            <p className="text-[#6B7268] mb-6">Your goal shapes everything — calories, protein, meal timing.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {([
                { val: 'fat_loss', label: 'Lose Fat', sub: 'Calorie deficit, preserve muscle' },
                { val: 'muscle_gain', label: 'Build Muscle', sub: 'Calorie surplus, high protein' },
                { val: 'clean_eating', label: 'Eat Cleaner', sub: 'Whole foods, balanced macros' },
                { val: 'manage_condition', label: 'Manage Condition', sub: 'PCOS, diabetes, thyroid...' },
              ] as { val: Goal; label: string; sub: string }[]).map(g => (
                <button key={g.val} onClick={() => set('goal', g.val)}
                  className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${form.goal === g.val ? 'border-[#2D4A3E] bg-[#2D4A3E]/5' : 'border-[#E8E4DC] bg-white hover:border-[#2D4A3E]/30'}`}>
                  <div className="font-medium text-ink text-sm mb-1">{g.label}</div>
                  <div className="text-xs text-[#6B7268]">{g.sub}</div>
                </button>
              ))}
            </div>
            {form.goal === 'manage_condition' && (
              <div className="mt-4">
                <Label className="mb-2 block">Which condition?</Label>
                <div className="flex flex-wrap gap-2">
                  {['PCOS', 'Type 2 Diabetes', 'Hypertension', 'Thyroid', 'High Cholesterol'].map(c => (
                    <button key={c} onClick={() => set('condition', form.condition === c ? '' : c)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.condition === c ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">
              {form.goal === 'fat_loss' ? 'How much do you want to lose, and by when?' :
               form.goal === 'muscle_gain' ? 'How much muscle do you want to gain?' :
               form.goal === 'clean_eating' ? "You're on your way." : 'Any specific targets?'}
            </h2>
            {form.goal === 'clean_eating' ? (
              <p className="text-[#6B7268]">Clean eating is about consistency, not a number. We will set you up with balanced whole-food meals.</p>
            ) : form.goal === 'manage_condition' ? (
              <div>
                <p className="text-[#6B7268] mb-4">Any specific targets from your doctor? (Optional)</p>
                <Textarea placeholder="e.g. Keep fasting glucose under 110..." value={form.condition_notes}
                  onChange={e => set('condition_notes', e.target.value)} className="min-h-[100px]" />
                <p className="text-xs text-[#6B7268] mt-2">This is not medical advice. Always follow your doctor's guidance.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                <div>
                  <Label className="mb-3 block">Weight to {form.goal === 'fat_loss' ? 'lose' : 'gain'}: <strong>{form.target_kg} kg</strong></Label>
                  <Slider min={2} max={form.goal === 'muscle_gain' ? 10 : 20} step={0.5} value={[form.target_kg]} onValueChange={([v]) => set('target_kg', v)} />
                </div>
                <div>
                  <Label className="mb-3 block">Timeline: <strong>{form.target_weeks} weeks</strong></Label>
                  <Slider min={form.goal === 'muscle_gain' ? 8 : 4} max={52} step={1} value={[form.target_weeks]} onValueChange={([v]) => set('target_weeks', v)} />
                </div>
                {form.target_kg > 0 && form.target_weeks > 0 && (
                  <div className="bg-white rounded-xl p-4 border border-[#E8E4DC]">
                    <div className="text-sm font-medium text-ink">
                      That is {(form.target_kg / form.target_weeks).toFixed(2)} kg/week
                    </div>
                    <div className={`text-sm mt-1 ${form.target_kg / form.target_weeks > 1 ? 'text-[#D4A574]' : 'text-[#7BA088]'}`}>
                      {getWeeklyRateLabel(form.target_kg / form.target_weeks, form.goal)}
                    </div>
                    {form.target_kg / form.target_weeks > 1 && (
                      <p className="text-xs text-[#6B7268] mt-1">That is aggressive. 0.5-0.75 kg/week is more sustainable.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Your body stats</h2>
            <p className="text-[#6B7268] mb-6">Used to calculate your exact calorie and protein targets.</p>
            <div className="space-y-5">
              <div>
                <Label className="mb-2 block">Height: <strong>{form.height_cm} cm</strong></Label>
                <Slider min={140} max={220} step={1} value={[form.height_cm]} onValueChange={([v]) => set('height_cm', v)} />
              </div>
              <div>
                <Label className="mb-2 block">Weight: <strong>{form.weight_kg} kg</strong></Label>
                <Slider min={35} max={160} step={0.5} value={[form.weight_kg]} onValueChange={([v]) => set('weight_kg', v)} />
              </div>
              <div>
                <Label className="mb-2 block">Age</Label>
                <Input type="number" value={form.age || ''} onChange={e => set('age', Number(e.target.value))} placeholder="25" min={15} max={80} />
              </div>
              <div>
                <Label className="mb-2 block">Sex</Label>
                <div className="flex gap-3">
                  {(['male', 'female', 'other'] as Sex[]).map(s => (
                    <button key={s} onClick={() => set('sex', s)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${form.sex === s ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {macros && (
              <div className="mt-6 bg-white rounded-xl p-4 border border-[#E8E4DC]">
                <div className="text-sm text-[#6B7268] mb-1">Your BMI</div>
                <div className="text-2xl font-display font-bold" style={{ color: bmiInfo?.color }}>{macros.bmi}</div>
                <div className="text-sm font-medium" style={{ color: bmiInfo?.color }}>{bmiInfo?.label}</div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Activity and exercise</h2>
            <p className="text-[#6B7268] mb-6">Affects your daily calorie burn and meal timing.</p>
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block">How active is your day-to-day?</Label>
                <div className="space-y-2">
                  {([
                    { val: 'sedentary', label: 'Sedentary', sub: 'Desk job, barely move' },
                    { val: 'light', label: 'Lightly Active', sub: 'Some walking, light activity' },
                    { val: 'active', label: 'Active', sub: 'On your feet a lot' },
                    { val: 'very_active', label: 'Very Active', sub: 'Physical job or very active lifestyle' },
                  ] as { val: ActivityLevel; label: string; sub: string }[]).map(a => (
                    <button key={a.val} onClick={() => set('activity_level', a.val)}
                      className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${form.activity_level === a.val ? 'border-[#2D4A3E] bg-[#2D4A3E]/5' : 'border-[#E8E4DC] bg-white hover:border-[#2D4A3E]/30'}`}>
                      <span className="font-medium text-sm text-ink">{a.label}</span>
                      <span className="text-xs text-[#6B7268] ml-2">-- {a.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-3 block">Do you exercise regularly?</Label>
                <div className="flex gap-3">
                  {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(o => (
                    <button key={String(o.val)} onClick={() => set('works_out', o.val)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${form.works_out === o.val ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.works_out && (
                <>
                  <div>
                    <Label className="mb-3 block">What do you do? (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {WORKOUT_TYPES.map(t => (
                        <button key={t} onClick={() => set('workout_type', toggle(form.workout_type, t))}
                          className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.workout_type.includes(t) ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-3 block">Which days?</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS.map(d => (
                        <button key={d} onClick={() => set('workout_days', toggle(form.workout_days, DAY_MAP[d]))}
                          className={`w-11 h-11 rounded-xl text-sm font-medium transition-all ${form.workout_days.includes(DAY_MAP[d]) ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-3 block">When do you usually work out?</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Morning (before 10am)', val: '08:00' },
                        { label: 'Afternoon', val: '13:00' },
                        { label: 'Evening (after 5pm)', val: '18:00' },
                        { label: 'Varies', val: '' },
                      ].map(o => (
                        <button key={o.label} onClick={() => set('workout_time', o.val)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.workout_time === o.val ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">What are you comfortable eating?</h2>
            <p className="text-[#6B7268] mb-6">Turn off anything you do not eat. All on by default.</p>
            <div className="space-y-4">
              {([
                { key: 'okay_with_dairy', label: 'Okay with dairy', sub: 'Milk, curd, paneer, cheese' },
                { key: 'okay_with_eggs', label: 'Okay with eggs', sub: 'Whole eggs, egg whites, omelettes' },
                { key: 'okay_with_meat_fish', label: 'Okay with meat and fish', sub: 'Chicken, mutton, fish, prawns' },
              ] as { key: keyof FormData; label: string; sub: string }[]).map(item => (
                <div key={item.key as string} className="flex items-center justify-between bg-white rounded-xl p-4 border border-[#E8E4DC]">
                  <div>
                    <div className="font-medium text-sm text-ink">{item.label}</div>
                    <div className="text-xs text-[#6B7268]">{item.sub}</div>
                  </div>
                  <Switch checked={form[item.key] as boolean} onCheckedChange={v => set(item.key, v as FormData[typeof item.key])} />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Describe your everyday food</h2>
            <p className="text-[#6B7268] mb-4">We will plan meals you will actually want to eat.</p>
            <Textarea placeholder="Dal chawal, chicken curry, the usual Punjabi stuff..." value={form.food_style_notes}
              onChange={e => set('food_style_notes', e.target.value)} className="min-h-[100px] mb-4" />
            <div className="flex flex-wrap gap-2 mb-4">
              {FOOD_CHIPS.map(chip => (
                <button key={chip} onClick={() => set('food_style', toggle(form.food_style, chip))}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.food_style.includes(chip) ? 'bg-[#2D4A3E] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#2D4A3E]'}`}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 7 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Allergies and dislikes</h2>
            <p className="text-[#6B7268] mb-6">We will never include these in your plan.</p>
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block font-medium">Foods you are allergic to</Label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGY_CHIPS.map(a => (
                    <button key={a} onClick={() => set('allergies', toggle(form.allergies, a))}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.allergies.includes(a) ? 'bg-[#C66B5C] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#C66B5C]'}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-3 block font-medium">Foods you just do not like</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DISLIKE_CHIPS.map(d => (
                    <button key={d} onClick={() => set('dislikes', toggle(form.dislikes, d))}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${form.dislikes.includes(d) ? 'bg-[#D4A574] text-white' : 'bg-white border border-[#D8D4CC] text-ink hover:border-[#D4A574]'}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <Textarea placeholder="Anything else? e.g. Karela, arbi, no maida..." value={form.dislikes_notes}
                  onChange={e => set('dislikes_notes', e.target.value)} className="min-h-[80px]" />
              </div>
            </div>
          </div>
        )}

        {step === 8 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Budget and cooking</h2>
            <p className="text-[#6B7268] mb-6">Your plan stays realistic for your lifestyle.</p>
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block">Weekly grocery budget: <strong>Rs {form.budget_weekly}</strong></Label>
                <Slider min={500} max={10000} step={100} value={[form.budget_weekly]} onValueChange={([v]) => set('budget_weekly', v)} />
                <div className="flex justify-between text-xs text-[#6B7268] mt-1"><span>Rs 500</span><span>Rs 10,000</span></div>
              </div>
              <div>
                <Label className="mb-3 block">How do you handle meals on weekdays?</Label>
                <div className="space-y-2">
                  {([
                    { val: 'under_15', label: 'Zero cooking', sub: 'Ready-to-eat or 5 min max' },
                    { val: '15_30', label: 'Quick cooking', sub: '15 min, simple stuff' },
                    { val: '30_45', label: 'I can cook', sub: '30 min meals are fine' },
                    { val: '45_plus', label: 'I enjoy cooking', sub: 'Happy to spend 45+ min' },
                  ] as { val: CookingTime; label: string; sub: string }[]).map(o => (
                    <button key={o.val} onClick={() => set('max_cooking_time', o.val)}
                      className={`w-full p-3.5 rounded-xl border-2 text-left transition-all ${form.max_cooking_time === o.val ? 'border-[#2D4A3E] bg-[#2D4A3E]/5' : 'border-[#E8E4DC] bg-white hover:border-[#2D4A3E]/30'}`}>
                      <span className="font-medium text-sm text-ink">{o.label}</span>
                      <span className="text-xs text-[#6B7268] ml-2">-- {o.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-[#E8E4DC]">
                <div>
                  <div className="font-medium text-sm text-ink">Meal prep on weekends?</div>
                  <div className="text-xs text-[#6B7268]">Batch cooking on Saturday/Sunday</div>
                </div>
                <Switch checked={form.meal_preps} onCheckedChange={v => set('meal_preps', v)} />
              </div>
            </div>
          </div>
        )}

        {step === 9 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Schedule and contact</h2>
            <p className="text-[#6B7268] mb-6">We will send reminders at the right time for you.</p>
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block font-medium">How many messages do you want per day?</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => set('messaging_mode', 'full')}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${form.messaging_mode === 'full' ? 'border-[#2D4A3E] bg-[#2D4A3E]/5' : 'border-[#E8E4DC] bg-white hover:border-[#2D4A3E]/30'}`}
                  >
                    <div className="font-medium text-sm text-ink mb-1">Full — All reminders</div>
                    <div className="text-xs text-[#6B7268]">Morning summary, meal reminders, post-meal check-ins, evening recap (10+ messages)</div>
                  </button>
                  <button
                    onClick={() => set('messaging_mode', 'summary')}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${form.messaging_mode === 'summary' ? 'border-[#2D4A3E] bg-[#2D4A3E]/5' : 'border-[#E8E4DC] bg-white hover:border-[#2D4A3E]/30'}`}
                  >
                    <div className="font-medium text-sm text-ink mb-1">Minimal — Just essentials</div>
                    <div className="text-xs text-[#6B7268]">One morning plan + one evening summary (2 messages/day)</div>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Wake up time</Label>
                  <Input type="time" value={form.wake_time} onChange={e => set('wake_time', e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">Sleep time</Label>
                  <Input type="time" value={form.sleep_time} onChange={e => set('sleep_time', e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Your name *</Label>
                <Input placeholder="Sagar" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <Label className="mb-2 block">Phone number *</Label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 bg-[#F5F3EE] border border-[#D8D4CC] rounded-xl text-sm text-[#6B7268] shrink-0 select-none">+91</div>
                  <Input
                    placeholder="9876543210"
                    value={form.phone_number}
                    onChange={e => set('phone_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    inputMode="numeric"
                    className="flex-1"
                  />
                </div>
                {form.phone_number.length > 0 && !isValidIndianPhone(form.phone_number) && (
                  <p className="text-xs text-[#C66B5C] mt-1">Enter a valid 10-digit Indian mobile number (starts with 6–9)</p>
                )}
                {isValidIndianPhone(form.phone_number) && (
                  <p className="text-xs text-[#7BA088] mt-1">✓ Valid number</p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Telegram username (optional)</Label>
                <Input placeholder="@username" value={form.telegram_username} onChange={e => set('telegram_username', e.target.value)} />
                <p className="text-xs text-[#6B7268] mt-1">Find yours in Telegram Settings. We will find you by phone number if you do not have one.</p>
              </div>
            </div>
          </div>
        )}

        {step === 10 && macros && (
          <div>
            <h2 className="font-display text-2xl font-bold text-ink mb-1">Your targets, locked in.</h2>
            <p className="text-[#6B7268] mb-6">Based on your profile. Click below to generate your 7-day meal plan.</p>
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-[#E8E4DC]">
                <div className="text-sm text-[#6B7268] mb-1">BMI</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold" style={{ color: bmiInfo?.color }}>{macros.bmi}</span>
                  <span className="font-medium" style={{ color: bmiInfo?.color }}>{bmiInfo?.label}</span>
                </div>
              </div>
              <div className="bg-[#2D4A3E] text-white rounded-2xl p-5">
                <div className="text-sm text-white/70 mb-1">Daily calories</div>
                <div className="font-display text-4xl font-bold">{macros.target_kcal} kcal</div>
                <div className="text-sm text-white/70 mt-1">Workout days: {macros.workout_day_kcal} kcal</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Protein', val: macros.target_protein_g },
                  { label: 'Carbs', val: macros.target_carbs_g },
                  { label: 'Fat', val: macros.target_fat_g },
                ].map(m => (
                  <div key={m.label} className="bg-white rounded-xl p-4 border border-[#E8E4DC] text-center">
                    <div className="text-xs text-[#6B7268] mb-1">{m.label}</div>
                    <div className="font-display text-xl font-bold text-ink">{m.val}g</div>
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-[#C66B5C] text-sm mt-4">{error}</p>}
          </div>
        )}

        {step === 10 && !macros && (
          <div>
            <p className="text-[#6B7268]">Please go back and fill in your body stats (step 3) and activity level (step 4) to see your targets.</p>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          {step < TOTAL_STEPS ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="flex-1 bg-[#2D4A3E] hover:bg-[#243d32]">
              Continue <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading || !macros} className="flex-1 bg-[#E89B7C] hover:bg-[#d9845f]">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating your plan...</>
              ) : (
                <>Generate my meal plan <Check className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

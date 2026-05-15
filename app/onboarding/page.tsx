"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { calculateMacros, getBMILabel } from "@/lib/macro-calculator";

// ============================================================
// TYPES
// ============================================================
type Goal = "fat_loss" | "muscle_gain" | "clean_eating" | "manage_condition";
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "active" | "very_active";
type CookingTime = "under_15" | "15_30" | "30_45" | "45_plus";
type Region = "north" | "south" | "east" | "west" | "other";

interface Profile {
  telegramChatId: number | null;
  goal: Goal | null;
  condition: string;
  target_kg: number;
  target_weeks: number;
  height_cm: number;
  weight_kg: number;
  age: number;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
  okay_with_dairy: boolean;
  okay_with_eggs: boolean;
  okay_with_meat_fish: boolean;
  food_style: string[];
  food_style_notes: string;
  food_region_note: string;
  allergies: string[];
  dislikes: string[];
  dislikes_notes: string;
  works_out: boolean;
  workout_types: string[];
  workout_days: string[];
  workout_time: string;
  region: Region | null;
  budget_weekly: number;
  max_cooking_time: CookingTime | null;
  meal_preps: boolean;
  wake_time: string;
  sleep_time: string;
}

const TOTAL_STEPS = 10;

const FOOD_STYLE_CHIPS = [
  "North Indian", "South Indian", "Bengali", "Gujarati",
  "Maharashtrian", "Continental", "Chinese/Asian", "Health food", "Mixed",
];

const WORKOUT_TYPE_OPTIONS = [
  { value: "gym_strength", label: "🏋️ Gym / Weight Training" },
  { value: "running_cardio", label: "🏃 Running / Cardio" },
  { value: "yoga_pilates", label: "🧘 Yoga / Pilates" },
  { value: "swimming", label: "🏊 Swimming" },
  { value: "sports", label: "🏸 Sports (cricket, badminton, etc.)" },
  { value: "walking", label: "🚶 Walking / Light activity" },
];

const WORKOUT_DAYS_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORKOUT_DAYS_FULL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const ALLERGY_OPTIONS = [
  "Peanuts", "Tree nuts", "Gluten", "Dairy", "Eggs", "Shellfish",
  "Mushrooms", "Soy", "Sesame",
];

const DISLIKE_OPTIONS = [
  "Bitter gourd", "Karela", "Brinjal", "Okra", "Seafood",
  "Red meat", "Spicy food", "Raw onion", "Garlic", "Coriander",
];

// ============================================================
// SMALL COMPONENTS
// ============================================================
function ProgressBar({ step }: { step: number }) {
  const pct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-2" style={{ color: "#6B7268" }}>
        <span>Step {step} of {TOTAL_STEPS}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ backgroundColor: "#E8E4DC" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: "#2D4A3E" }}
        />
      </div>
    </div>
  );
}

function StepCard({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl p-8" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 24px rgba(45,74,62,0.08)" }}>
      <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
        {title}
      </h2>
      {subtitle && <p className="text-sm mb-6" style={{ color: "#6B7268" }}>{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-xl border-2 transition-all font-medium text-sm"
      style={{
        borderColor: selected ? "#2D4A3E" : "#E8E4DC",
        backgroundColor: selected ? "rgba(45,74,62,0.06)" : "#FFFFFF",
        color: selected ? "#2D4A3E" : "#1A1F1B",
      }}>
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
      <div>
        <div className="font-medium text-sm" style={{ color: "#1A1F1B" }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{description}</div>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "#2D4A3E" : "#D1D5DB" }}>
        <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5"
          style={{ transform: checked ? "translateX(1.25rem)" : "translateX(0.125rem)" }} />
      </button>
    </div>
  );
}

function TagSelector({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => toggle(opt)}
          className="px-3 py-1.5 rounded-full text-sm border transition-all"
          style={{
            borderColor: selected.includes(opt) ? "#2D4A3E" : "#E8E4DC",
            backgroundColor: selected.includes(opt) ? "#2D4A3E" : "#FFFFFF",
            color: selected.includes(opt) ? "#FFFFFF" : "#1A1F1B",
          }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// MAIN ONBOARDING
// ============================================================
function OnboardingContent() {
  const searchParams = useSearchParams();
  const tgId = searchParams.get("tg");

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [computedMacros, setComputedMacros] = useState<ReturnType<typeof calculateMacros> | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [weekPlan, setWeekPlan] = useState<Record<string, unknown>[] | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(new Date().getDay());
  const [editingSlot, setEditingSlot] = useState<{ dayIndex: number; slotName: string } | null>(null);
  const [editText, setEditText] = useState("");

  const [profile, setProfile] = useState<Profile>({
    telegramChatId: tgId ? parseInt(tgId, 10) : null,
    goal: null,
    condition: "",
    target_kg: 5,
    target_weeks: 12,
    height_cm: 170,
    weight_kg: 70,
    age: 28,
    sex: null,
    activity_level: null,
    okay_with_dairy: true,
    okay_with_eggs: true,
    okay_with_meat_fish: true,
    food_style: [],
    food_style_notes: "",
    food_region_note: "",
    allergies: [],
    dislikes: [],
    dislikes_notes: "",
    works_out: false,
    workout_types: [],
    workout_days: [],
    workout_time: "",
    region: null,
    budget_weekly: 2000,
    max_cooking_time: null,
    meal_preps: false,
    wake_time: "07:00",
    sleep_time: "23:00",
  });

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 1: return profile.goal !== null;
      case 2: return profile.height_cm > 0 && profile.weight_kg > 0 && profile.age > 0 && profile.sex !== null;
      case 3: return profile.activity_level !== null;
      case 8: return profile.max_cooking_time !== null;
      default: return true;
    }
  }

  async function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else if (step === TOTAL_STEPS - 1) {
      if (profile.height_cm && profile.weight_kg && profile.age && profile.sex && profile.activity_level && profile.goal) {
        const macros = calculateMacros({
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          age: profile.age,
          sex: profile.sex,
          activity_level: profile.activity_level,
          goal: profile.goal,
          condition: profile.condition || undefined,
          target_kg: profile.target_kg,
          target_weeks: profile.target_weeks,
        });
        setComputedMacros(macros);
      }
      setStep(TOTAL_STEPS);
    }
  }

  async function handleSubmit() {
    if (!computedMacros) return;
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramChatId: tgId ? parseInt(tgId) : null,
          goal: profile.goal,
          condition: profile.condition || null,
          target_kg: profile.target_kg,
          target_weeks: profile.target_weeks,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          age: profile.age,
          sex: profile.sex,
          activity_level: profile.activity_level,
          okay_with_dairy: profile.okay_with_dairy,
          okay_with_eggs: profile.okay_with_eggs,
          okay_with_meat_fish: profile.okay_with_meat_fish,
          food_style: profile.food_style,
          food_style_notes: [profile.food_style_notes, profile.food_region_note].filter(Boolean).join(" | ") || null,
          allergies: profile.allergies,
          dislikes: profile.dislikes,
          dislikes_notes: profile.dislikes_notes || null,
          works_out: profile.works_out,
          workout_type: profile.workout_types.join(", ") || null,
          workout_days: profile.workout_days,
          workout_time: profile.workout_time || null,
          region: profile.region || null,
          budget_weekly: profile.budget_weekly,
          max_cooking_time: profile.max_cooking_time,
          meal_preps: profile.meal_preps,
          wake_time: profile.wake_time,
          sleep_time: profile.sleep_time,
          bmi: computedMacros.bmi,
          bmr: computedMacros.bmr,
          tdee: computedMacros.tdee,
          target_kcal: computedMacros.target_kcal,
          target_protein_g: computedMacros.target_protein_g,
          target_carbs_g: computedMacros.target_carbs_g,
          target_fat_g: computedMacros.target_fat_g,
          onboarding_complete: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.userId) {
        setSubmitError(data.error || "Failed to save your profile. Please try again.");
        return;
      }

      setSavedUserId(data.userId);
      setSaved(true);

      // Open Telegram bot automatically
      window.open("https://t.me/kanshi_bot", "_blank");

      // Fetch the generated plan (may take 30s — show loading state)
      setPlanLoading(true);
      try {
        const planRes = await fetch(`/api/plan?uid=${data.userId}`);
        const planData = await planRes.json();
        if (planData.days?.length) {
          setWeekPlan(planData.days as Record<string, unknown>[]);
        }
      } catch {
        // Plan will show loading state; user can check Telegram
      } finally {
        setPlanLoading(false);
      }
    } catch (e) {
      console.error("Submit error:", e);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const bmiInfo = profile.height_cm && profile.weight_kg
    ? getBMILabel(Math.round((profile.weight_kg / Math.pow(profile.height_cm / 100, 2)) * 10) / 10)
    : null;

  const weeklyRate = profile.goal === "fat_loss"
    ? Math.min(profile.target_kg / profile.target_weeks, 1.0).toFixed(2)
    : null;

  // no tgId warning removed — saving now works with or without Telegram link

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#FAF8F3" }}>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2D4A3E" }}>
            Lockin 🔒
          </span>
        </div>

        <ProgressBar step={step} />
        <div className="mt-6" />

        {/* ── Step 1: Goal ── */}
        {step === 1 && (
          <StepCard title="What's your goal?" subtitle="We'll set your calorie and macro targets around this.">
            <div className="space-y-3">
              {[
                { value: "fat_loss", label: "Fat loss", desc: "Lose weight while preserving muscle" },
                { value: "muscle_gain", label: "Muscle gain", desc: "Lean bulk — build size with minimal fat" },
                { value: "clean_eating", label: "Clean eating", desc: "Eat well at maintenance, no extreme cuts" },
                { value: "manage_condition", label: "Manage a condition", desc: "Diabetes, PCOS, thyroid, etc." },
              ].map(opt => (
                <OptionButton key={opt.value} selected={profile.goal === opt.value} onClick={() => update("goal", opt.value as Goal)}>
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{opt.desc}</div>
                </OptionButton>
              ))}
            </div>

            {profile.goal === "manage_condition" && (
              <div className="mt-4">
                <label className="text-sm font-medium" style={{ color: "#1A1F1B" }}>Which condition?</label>
                <input type="text" placeholder="e.g. Diabetes, PCOS, thyroid..."
                  value={profile.condition} onChange={e => update("condition", e.target.value)}
                  className="mt-2 w-full border rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC" }} />
              </div>
            )}

            {profile.goal === "fat_loss" && (
              <div className="mt-5 space-y-4 p-4 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Target loss</span>
                    <span className="font-semibold">{profile.target_kg} kg</span>
                  </div>
                  <input type="range" min={1} max={40} step={1} value={profile.target_kg}
                    onChange={e => update("target_kg", parseInt(e.target.value))} className="w-full" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Timeframe</span>
                    <span className="font-semibold">{profile.target_weeks} weeks</span>
                  </div>
                  <input type="range" min={4} max={52} step={1} value={profile.target_weeks}
                    onChange={e => update("target_weeks", parseInt(e.target.value))} className="w-full" />
                </div>
                {weeklyRate && (
                  <div className="text-xs px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: parseFloat(weeklyRate) > 0.75 ? "rgba(198,107,92,0.1)" : "rgba(123,160,136,0.15)",
                      color: parseFloat(weeklyRate) > 0.75 ? "#C66B5C" : "#2D4A3E",
                    }}>
                    {parseFloat(weeklyRate) > 0.75
                      ? `⚠ ${weeklyRate} kg/week is aggressive. We'll cap at 1.0 kg/week for safety.`
                      : `✓ ${weeklyRate} kg/week — sustainable pace`}
                  </div>
                )}
              </div>
            )}
          </StepCard>
        )}

        {/* ── Step 2: Body Stats ── */}
        {step === 2 && (
          <StepCard title="Your body stats" subtitle="Used to calculate your BMR and TDEE accurately.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Height (cm)</label>
                  <input type="number" min={100} max={250} value={profile.height_cm || ""}
                    onChange={e => update("height_cm", parseFloat(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: "#E8E4DC" }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Weight (kg)</label>
                  <input type="number" min={30} max={300} step={0.1} value={profile.weight_kg || ""}
                    onChange={e => update("weight_kg", parseFloat(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: "#E8E4DC" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Age</label>
                  <input type="number" min={18} max={90} value={profile.age || ""}
                    onChange={e => update("age", parseInt(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: "#E8E4DC" }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Sex</label>
                  <div className="flex gap-2">
                    {(["male", "female", "other"] as Sex[]).map(s => (
                      <button key={s} type="button" onClick={() => update("sex", s)}
                        className="flex-1 py-3 rounded-xl text-xs font-medium border capitalize transition-all"
                        style={{
                          borderColor: profile.sex === s ? "#2D4A3E" : "#E8E4DC",
                          backgroundColor: profile.sex === s ? "#2D4A3E" : "#FFFFFF",
                          color: profile.sex === s ? "#FFFFFF" : "#1A1F1B",
                        }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {bmiInfo && profile.height_cm > 100 && profile.weight_kg > 0 && (
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
                  <span className="text-sm" style={{ color: "#6B7268" }}>Your BMI</span>
                  <span className="font-bold text-lg">
                    {(profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)}
                    <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${bmiInfo.color}20`, color: bmiInfo.color }}>
                      {bmiInfo.label}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </StepCard>
        )}

        {/* ── Step 3: Activity Level ── */}
        {step === 3 && (
          <StepCard title="How active are you?" subtitle="Day-to-day activity outside formal exercise.">
            <div className="space-y-3">
              {[
                { value: "sedentary", label: "Sedentary", desc: "Desk job, mostly sitting all day" },
                { value: "light", label: "Lightly active", desc: "Walking, light work, some movement" },
                { value: "active", label: "Active", desc: "On your feet most of the day" },
                { value: "very_active", label: "Very active", desc: "Manual labour, intense daily movement" },
              ].map(opt => (
                <OptionButton key={opt.value} selected={profile.activity_level === opt.value}
                  onClick={() => update("activity_level", opt.value as ActivityLevel)}>
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{opt.desc}</div>
                </OptionButton>
              ))}
            </div>
          </StepCard>
        )}

        {/* ── Step 4: Fitness Routine ── */}
        {step === 4 && (
          <StepCard title="Do you exercise?" subtitle="Workout days get +12% calories automatically.">
            <div className="space-y-3">
              {[
                { value: "yes", label: "Yes, regularly" },
                { value: "sometimes", label: "Sometimes" },
                { value: "no", label: "No" },
              ].map(opt => (
                <OptionButton key={opt.value}
                  selected={profile.workout_time === opt.value}
                  onClick={() => {
                    update("workout_time", opt.value);
                    update("works_out", opt.value !== "no");
                  }}>
                  {opt.label}
                </OptionButton>
              ))}
            </div>

            {profile.works_out && (
              <div className="mt-5 space-y-5">
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>What do you do? (select all)</label>
                  <div className="space-y-2">
                    {WORKOUT_TYPE_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          const types = profile.workout_types.includes(opt.value)
                            ? profile.workout_types.filter(t => t !== opt.value)
                            : [...profile.workout_types, opt.value];
                          update("workout_types", types);
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                        style={{
                          borderColor: profile.workout_types.includes(opt.value) ? "#2D4A3E" : "#E8E4DC",
                          backgroundColor: profile.workout_types.includes(opt.value) ? "rgba(45,74,62,0.06)" : "#FFFFFF",
                          color: profile.workout_types.includes(opt.value) ? "#2D4A3E" : "#1A1F1B",
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Which days?</label>
                  <div className="flex flex-wrap gap-2">
                    {WORKOUT_DAYS_OPTIONS.map((d, i) => (
                      <button key={d} type="button"
                        onClick={() => {
                          const full = WORKOUT_DAYS_FULL[i];
                          const days = profile.workout_days.includes(full)
                            ? profile.workout_days.filter(x => x !== full)
                            : [...profile.workout_days, full];
                          update("workout_days", days);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                        style={{
                          borderColor: profile.workout_days.includes(WORKOUT_DAYS_FULL[i]) ? "#2D4A3E" : "#E8E4DC",
                          backgroundColor: profile.workout_days.includes(WORKOUT_DAYS_FULL[i]) ? "#2D4A3E" : "#FFFFFF",
                          color: profile.workout_days.includes(WORKOUT_DAYS_FULL[i]) ? "#FFFFFF" : "#1A1F1B",
                        }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>When?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Morning (before 10am)", "Afternoon", "Evening (after 5pm)", "Varies"].map(t => (
                      <OptionButton key={t} selected={profile.workout_time === t.toLowerCase()}
                        onClick={() => update("workout_time", t.toLowerCase())}>
                        <span className="text-sm">{t}</span>
                      </OptionButton>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </StepCard>
        )}

        {/* ── Step 5: Food Comfort ── */}
        {step === 5 && (
          <StepCard title="Food comfort" subtitle="We'll only suggest food you're comfortable with.">
            <div className="space-y-3">
              <Toggle checked={profile.okay_with_dairy} onChange={v => update("okay_with_dairy", v)}
                label="Okay with dairy" description="Milk, curd, paneer, cheese" />
              <Toggle checked={profile.okay_with_eggs} onChange={v => update("okay_with_eggs", v)}
                label="Okay with eggs" description="Egg whites, whole eggs, egg dishes" />
              <Toggle checked={profile.okay_with_meat_fish} onChange={v => update("okay_with_meat_fish", v)}
                label="Okay with meat & fish" description="Chicken, mutton, fish, seafood" />
            </div>
          </StepCard>
        )}

        {/* ── Step 6: Food Style ── */}
        {step === 6 && (
          <StepCard title="Your food style" subtitle="Describe it naturally — we use this to personalise every meal.">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Describe your everyday food in a sentence
                </label>
                <textarea rows={3} value={profile.food_style_notes}
                  onChange={e => update("food_style_notes", e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ borderColor: "#E8E4DC" }}
                  placeholder={[
                    "Dal chawal, chicken curry, the usual Punjabi stuff",
                    "Mostly South Indian — idli, dosa, sambar",
                    "Whatever's quick — oats, eggs, sandwiches",
                    "Gujarati at home, continental outside",
                  ][Math.floor(Date.now() / 5000) % 4]}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: "#6B7268" }}>Quick select (tap to add):</label>
                <div className="flex flex-wrap gap-2">
                  {FOOD_STYLE_CHIPS.map(chip => (
                    <button key={chip} type="button"
                      onClick={() => {
                        update("food_style", profile.food_style.includes(chip)
                          ? profile.food_style.filter(s => s !== chip)
                          : [...profile.food_style, chip]);
                        if (!profile.food_style.includes(chip)) {
                          update("food_style_notes", (profile.food_style_notes + " " + chip).trim());
                        }
                      }}
                      className="px-3 py-1.5 rounded-full text-sm border transition-all"
                      style={{
                        borderColor: profile.food_style.includes(chip) ? "#2D4A3E" : "#E8E4DC",
                        backgroundColor: profile.food_style.includes(chip) ? "#2D4A3E" : "#FFFFFF",
                        color: profile.food_style.includes(chip) ? "#FFFFFF" : "#1A1F1B",
                      }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Living somewhere different from where you grew up?
                </label>
                <input type="text" value={profile.food_region_note}
                  onChange={e => update("food_region_note", e.target.value)}
                  placeholder="e.g. From Kerala, living in Gurgaon"
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC" }} />
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 7: Allergies & Dislikes ── */}
        {step === 7 && (
          <StepCard title="Allergies & dislikes" subtitle="These will never appear in your plan.">
            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Allergies</label>
                <TagSelector options={ALLERGY_OPTIONS} selected={profile.allergies} onChange={v => update("allergies", v)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Dislikes</label>
                <TagSelector options={DISLIKE_OPTIONS} selected={profile.dislikes} onChange={v => update("dislikes", v)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Anything else about food we should know?
                </label>
                <textarea rows={3} value={profile.dislikes_notes}
                  onChange={e => update("dislikes_notes", e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ borderColor: "#E8E4DC" }}
                  placeholder={[
                    "I can't digest milk after evening",
                    "Soya gives me gas, avoid after lunch",
                    "Bhindi nahi khata, arbi se allergy hai",
                    "No maida items please",
                    "I only eat fish on weekends",
                  ][Math.floor(Date.now() / 5000) % 5]}
                />
                <p className="text-xs mt-1" style={{ color: "#6B7268" }}>Hindi is totally fine here 🙂</p>
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 8: Cooking Style ── */}
        {step === 8 && (
          <StepCard title="How do you handle meals?" subtitle="Helps us suggest recipes that actually fit your life.">
            <div className="space-y-4">
              <div className="space-y-2">
                {[
                  { value: "under_15", label: "🏃 Zero cooking", desc: "Ready-to-eat or 5-min meals only" },
                  { value: "15_30", label: "🍳 Quick cooking", desc: "15 min max, simple stuff" },
                  { value: "30_45", label: "👨‍🍳 I can cook", desc: "30 min meals are fine" },
                  { value: "45_plus", label: "🧑‍🍳 I enjoy cooking", desc: "Happy to spend 45+ min" },
                ].map(opt => (
                  <OptionButton key={opt.value} selected={profile.max_cooking_time === opt.value}
                    onClick={() => update("max_cooking_time", opt.value as CookingTime)}>
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs" style={{ color: "#6B7268" }}>{opt.desc}</div>
                  </OptionButton>
                ))}
              </div>
              <div className="mt-2">
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Do you batch cook or meal prep on weekends?
                </label>
                <div className="flex gap-3">
                  {[
                    { v: true, l: "Yes, I batch cook" },
                    { v: false, l: "No / Sometimes" },
                  ].map(opt => (
                    <OptionButton key={String(opt.v)} selected={profile.meal_preps === opt.v}
                      onClick={() => update("meal_preps", opt.v)}>
                      <span className="text-sm">{opt.l}</span>
                    </OptionButton>
                  ))}
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 9: Budget & Schedule ── */}
        {step === 9 && (
          <StepCard title="Budget & schedule">
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-2" style={{ color: "#1A1F1B" }}>
                  <span>Weekly grocery budget</span>
                  <span className="font-semibold">₹{profile.budget_weekly.toLocaleString()}</span>
                </div>
                <input type="range" min={500} max={10000} step={500} value={profile.budget_weekly}
                  onChange={e => update("budget_weekly", parseInt(e.target.value))} className="w-full" />
                <div className="flex justify-between text-xs mt-1" style={{ color: "#6B7268" }}>
                  <span>₹500</span><span>₹10,000</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Wake time</label>
                  <input type="time" value={profile.wake_time} onChange={e => update("wake_time", e.target.value)}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: "#E8E4DC" }} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Sleep time</label>
                  <input type="time" value={profile.sleep_time} onChange={e => update("sleep_time", e.target.value)}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: "#E8E4DC" }} />
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 10: Confirm targets ── */}
        {step === 10 && computedMacros && !saved && (
          <div className="space-y-4">
            <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}>
              <div className="text-4xl font-bold mb-1" style={{ fontFamily: "Fraunces, Georgia, serif" }}>
                You&apos;re locked in. 🔒
              </div>
              <p className="text-sm mt-2" style={{ color: "#7BA088" }}>Your personalised targets are ready.</p>
            </div>

            <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
              <div className="mb-5 pb-5" style={{ borderBottom: "1px solid #F0EDE6" }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "#6B7268" }}>Your BMI</span>
                  <span>
                    <span className="text-2xl font-bold" style={{ color: "#1A1F1B" }}>{computedMacros.bmi}</span>
                    <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${getBMILabel(computedMacros.bmi).color}20`, color: getBMILabel(computedMacros.bmi).color }}>
                      {getBMILabel(computedMacros.bmi).label}
                    </span>
                  </span>
                </div>
              </div>
              <div className="rounded-xl p-5 mb-4 text-center" style={{ backgroundColor: "rgba(45,74,62,0.06)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#5A7A6B" }}>Daily calorie target</div>
                <div className="text-5xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
                  {computedMacros.target_kcal.toLocaleString()}
                </div>
                <div className="text-sm mt-1" style={{ color: "#6B7268" }}>
                  kcal/day · {computedMacros.workout_day_kcal.toLocaleString()} on workout days
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Protein", value: computedMacros.target_protein_g, color: "#E89B7C" },
                  { label: "Carbs", value: computedMacros.target_carbs_g, color: "#D4A574" },
                  { label: "Fat", value: computedMacros.target_fat_g, color: "#7BA088" },
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FAF8F3" }}>
                    <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}<span className="text-sm">g</span></div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {submitError && (
              <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "rgba(198,107,92,0.1)", color: "#C66B5C" }}>
                {submitError}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-4 rounded-2xl font-semibold text-white transition-colors"
              style={{ backgroundColor: submitting ? "#5A7A6B" : "#2D4A3E" }}>
              {submitting ? "Saving & generating your plan..." : "Save & generate my plan →"}
            </button>
          </div>
        )}

        {/* ── Step 10: Success dashboard (after save) ── */}
        {step === 10 && computedMacros && saved && (() => {
          const deficit = computedMacros.tdee - computedMacros.target_kcal;
          const weeklyLossKg = Math.min(deficit > 0 ? (deficit * 7) / 7700 : 0, 1.0);
          const weeksToGoal = weeklyLossKg > 0 ? Math.ceil(profile.target_kg / weeklyLossKg) : profile.target_weeks;
          const projectedDate = new Date();
          projectedDate.setDate(projectedDate.getDate() + weeksToGoal * 7);
          const projectedLabel = projectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

          const milestones = [
            { label: '4 weeks', kg: +(profile.weight_kg - weeklyLossKg * 4).toFixed(1) },
            { label: '8 weeks', kg: +(profile.weight_kg - weeklyLossKg * 8).toFixed(1) },
            { label: `${weeksToGoal} weeks`, kg: +(profile.weight_kg - profile.target_kg).toFixed(1) },
          ];

          const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const SLOT_LABELS: Record<string, string> = {
            early_morning: '🌅 Early morning',
            breakfast: '🍳 Breakfast',
            mid_morning: '🥛 Mid-morning',
            lunch: '🍱 Lunch',
            evening_snack: '🥜 Evening snack',
            dinner: '🍽️ Dinner',
            pre_bed: '🌙 Pre-bed',
          };

          type Slot = { slot: string; time?: string; meal: string; kcal: number; protein_g: number; carbs_g?: number; fat_g?: number; prep_time_min?: number };
          type Day = { day_index: number; day_name: string; is_workout_day?: boolean; total_kcal?: number; slots: Slot[] };

          const activeDayData = weekPlan
            ? (weekPlan[activeDay] as Day | undefined)
            : null;

          async function saveSlotEdit(dayIndex: number, slotName: string, newMeal: string) {
            if (!savedUserId) return;
            await fetch('/api/plan/edit', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: savedUserId, dayIndex, slotName, meal: newMeal }),
            });
            // Refresh plan
            const planRes = await fetch(`/api/plan?uid=${savedUserId}`);
            const planData = await planRes.json();
            if (planData.days?.length) setWeekPlan(planData.days as Record<string, unknown>[]);
            setEditingSlot(null);
            setEditText('');
          }

          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}>
                <div className="text-5xl mb-3">🔒</div>
                <div className="text-3xl font-bold mb-2" style={{ fontFamily: "Fraunces, Georgia, serif" }}>
                  You&apos;re locked in!
                </div>
                <p className="text-sm" style={{ color: "#7BA088" }}>
                  Profile saved. Your personalised 7-day plan is below.
                </p>
              </div>

              {/* Goal projection */}
              {profile.goal === 'fat_loss' && weeklyLossKg > 0 && (
                <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
                  <div className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: "#5A7A6B" }}>Your goal projection</div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
                      -{profile.target_kg} kg
                    </span>
                    <span className="text-sm" style={{ color: "#6B7268" }}>by {projectedLabel}</span>
                  </div>
                  <p className="text-xs mb-5" style={{ color: "#6B7268" }}>
                    At {weeklyLossKg.toFixed(2)} kg/week — {deficit} kcal/day deficit
                  </p>
                  <div className="space-y-3">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-20 text-xs font-medium" style={{ color: "#6B7268" }}>{m.label}</div>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EDE6" }}>
                          <div className="h-full rounded-full" style={{
                            backgroundColor: "#2D4A3E",
                            width: `${Math.min(((i + 1) / milestones.length) * 100, 100)}%`,
                            opacity: 0.4 + (i * 0.2),
                          }} />
                        </div>
                        <div className="w-16 text-xs font-bold text-right" style={{ color: "#2D4A3E" }}>{m.kg} kg</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.goal === 'muscle_gain' && (
                <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
                  <div className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#5A7A6B" }}>Your goal projection</div>
                  <div className="space-y-3">
                    {[
                      { label: '4 weeks', muscle: '+0.8 kg lean mass', note: 'Strength noticeably up' },
                      { label: '8 weeks', muscle: '+1.6 kg lean mass', note: 'Visible muscle definition' },
                      { label: '12 weeks', muscle: '+2.5 kg lean mass', note: 'Significant body recomposition' },
                    ].map((m, i) => (
                      <div key={i} className="flex justify-between items-center p-3 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
                        <span className="text-sm font-medium" style={{ color: "#6B7268" }}>{m.label}</span>
                        <div className="text-right">
                          <div className="text-sm font-bold" style={{ color: "#2D4A3E" }}>{m.muscle}</div>
                          <div className="text-xs" style={{ color: "#6B7268" }}>{m.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily targets */}
              <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
                <div className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: "#5A7A6B" }}>Daily targets</div>
                <div className="rounded-xl p-4 text-center mb-4" style={{ backgroundColor: "rgba(45,74,62,0.06)" }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#5A7A6B" }}>Calories</div>
                  <div className="text-4xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
                    {computedMacros.target_kcal.toLocaleString()}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#6B7268" }}>{computedMacros.workout_day_kcal.toLocaleString()} on workout days</div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Protein", value: computedMacros.target_protein_g, color: "#E89B7C" },
                    { label: "Carbs", value: computedMacros.target_carbs_g, color: "#D4A574" },
                    { label: "Fat", value: computedMacros.target_fat_g, color: "#7BA088" },
                  ].map(m => (
                    <div key={m.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#FAF8F3" }}>
                      <div className="text-2xl font-bold" style={{ color: m.color }}>{m.value}<span className="text-sm">g</span></div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 7-Day Meal Plan ── */}
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
                <div className="px-6 pt-6 pb-3">
                  <div className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: "#5A7A6B" }}>Your 7-Day Meal Plan</div>

                  {/* Day tabs */}
                  <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {DAY_LABELS.map((d, i) => {
                      const dayData = weekPlan?.[i] as Day | undefined;
                      const isWorkout = dayData?.is_workout_day || profile.workout_days.includes(['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][i]);
                      return (
                        <button key={d} type="button"
                          onClick={() => setActiveDay(i)}
                          className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            backgroundColor: activeDay === i ? "#2D4A3E" : "#FAF8F3",
                            color: activeDay === i ? "#FFFFFF" : "#6B7268",
                            minWidth: '42px',
                          }}>
                          {d}
                          {isWorkout && <div className="text-xs" style={{ opacity: 0.7 }}>💪</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 pb-6">
                  {planLoading && (
                    <div className="py-12 text-center" style={{ color: "#6B7268" }}>
                      <div className="text-2xl mb-2">⏳</div>
                      <p className="text-sm">Generating your personalised plan...</p>
                      <p className="text-xs mt-1">This takes about 30 seconds</p>
                    </div>
                  )}

                  {!planLoading && !weekPlan && (
                    <div className="py-8 text-center" style={{ color: "#6B7268" }}>
                      <div className="text-2xl mb-2">🔔</div>
                      <p className="text-sm">Plan is being generated.</p>
                      <p className="text-xs mt-1">You&apos;ll get a Telegram notification when it&apos;s ready.</p>
                    </div>
                  )}

                  {!planLoading && weekPlan && activeDayData && (
                    <div className="space-y-3 mt-2">
                      {activeDayData.is_workout_day && (
                        <div className="text-xs px-3 py-2 rounded-lg font-medium" style={{ backgroundColor: "rgba(123,160,136,0.15)", color: "#2D4A3E" }}>
                          💪 Workout day — {activeDayData.total_kcal?.toLocaleString() || computedMacros.workout_day_kcal.toLocaleString()} kcal
                        </div>
                      )}
                      {activeDayData.slots?.map((slot: Slot) => {
                        const isEditing = editingSlot?.dayIndex === activeDay && editingSlot?.slotName === slot.slot;
                        return (
                          <div key={slot.slot} className="rounded-xl p-4" style={{ backgroundColor: "#FAF8F3" }}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <div className="text-xs font-semibold mb-0.5" style={{ color: "#5A7A6B" }}>
                                  {SLOT_LABELS[slot.slot] || slot.slot}
                                  {slot.time && <span className="ml-2 font-normal" style={{ color: "#9BA89A" }}>{slot.time}</span>}
                                </div>
                                {!isEditing && (
                                  <div className="text-sm font-medium" style={{ color: "#1A1F1B" }}>{slot.meal}</div>
                                )}
                              </div>
                              {!isEditing && (
                                <button type="button"
                                  onClick={() => { setEditingSlot({ dayIndex: activeDay, slotName: slot.slot }); setEditText(slot.meal); }}
                                  className="flex-shrink-0 text-xs px-2 py-1 rounded-lg border transition-all"
                                  style={{ borderColor: "#E8E4DC", color: "#6B7268" }}>
                                  Edit
                                </button>
                              )}
                            </div>

                            {isEditing && (
                              <div className="mt-1">
                                <textarea rows={2} value={editText} onChange={e => setEditText(e.target.value)}
                                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none mb-2"
                                  style={{ borderColor: "#2D4A3E" }} />
                                <div className="flex gap-2">
                                  <button type="button"
                                    onClick={() => saveSlotEdit(activeDay, slot.slot, editText)}
                                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white"
                                    style={{ backgroundColor: "#2D4A3E" }}>
                                    Save
                                  </button>
                                  <button type="button"
                                    onClick={() => { setEditingSlot(null); setEditText(''); }}
                                    className="flex-1 py-2 rounded-xl text-xs font-medium border"
                                    style={{ borderColor: "#E8E4DC", color: "#6B7268" }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {!isEditing && (
                              <div className="flex gap-3 mt-2 text-xs" style={{ color: "#9BA89A" }}>
                                <span>{slot.kcal} kcal</span>
                                <span>·</span>
                                <span>{slot.protein_g}g protein</span>
                                {slot.prep_time_min != null && slot.prep_time_min > 0 && (
                                  <><span>·</span><span>{slot.prep_time_min} min prep</span></>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#FAF8F3" }}>
                <p className="text-sm mb-4" style={{ color: "#6B7268" }}>
                  The bot will remind you before each meal and check in after. Just reply naturally.
                </p>
                <a href="https://t.me/kanshi_bot"
                  className="inline-block w-full py-4 rounded-2xl font-semibold text-white text-center"
                  style={{ backgroundColor: "#2D4A3E" }}>
                  Open Telegram bot →
                </a>
              </div>
            </div>
          );
        })()}

        {/* Navigation */}
        {step < TOTAL_STEPS && (
          <div className="mt-6 flex gap-3">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="flex-1 py-4 rounded-2xl font-medium border transition-colors"
                style={{ borderColor: "#E8E4DC", color: "#6B7268" }}>
                ← Back
              </button>
            )}
            <button type="button" onClick={handleNext} disabled={!canAdvance()}
              className="flex-1 py-4 rounded-2xl font-semibold text-white transition-colors"
              style={{ backgroundColor: canAdvance() ? "#2D4A3E" : "#B0BDB8" }}>
              {step === TOTAL_STEPS - 1 ? "Calculate my targets →" : "Continue →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

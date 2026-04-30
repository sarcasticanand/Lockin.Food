"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  allergies: string[];
  dislikes: string[];
  dislikes_notes: string;
  works_out: boolean;
  workout_type: string;
  workout_days: string[];
  workout_time: string;
  region: Region | null;
  budget_weekly: number;
  max_cooking_time: CookingTime | null;
  wake_time: string;
  sleep_time: string;
}

const TOTAL_STEPS = 10;

const FOOD_STYLE_OPTIONS = [
  "North Indian", "South Indian", "Bengali", "Gujarati",
  "Maharashtrian", "Continental", "Pan-Asian", "Mixed",
];

const ALLERGY_OPTIONS = [
  "Peanuts", "Tree nuts", "Gluten", "Dairy", "Eggs", "Shellfish",
  "Mushrooms", "Soy", "Sesame",
];

const DISLIKE_OPTIONS = [
  "Bitter gourd", "Karela", "Brinjal", "Okra", "Seafood",
  "Red meat", "Spicy food", "Raw onion", "Garlic", "Coriander",
];

const WORKOUT_DAYS_OPTIONS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

// ============================================================
// STEP COMPONENTS
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
      <h2
        className="text-2xl font-bold mb-1"
        style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}
      >
        {title}
      </h2>
      {subtitle && <p className="text-sm mb-6" style={{ color: "#6B7268" }}>{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-xl border-2 transition-all font-medium text-sm"
      style={{
        borderColor: selected ? "#2D4A3E" : "#E8E4DC",
        backgroundColor: selected ? "rgba(45,74,62,0.06)" : "#FFFFFF",
        color: selected ? "#2D4A3E" : "#1A1F1B",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
      <div>
        <div className="font-medium text-sm" style={{ color: "#1A1F1B" }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "#2D4A3E" : "#D1D5DB" }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5"
          style={{ transform: checked ? "translateX(1.25rem)" : "translateX(0.125rem)" }}
        />
      </button>
    </div>
  );
}

function TagSelector({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className="px-3 py-1.5 rounded-full text-sm border transition-all"
          style={{
            borderColor: selected.includes(opt) ? "#2D4A3E" : "#E8E4DC",
            backgroundColor: selected.includes(opt) ? "#2D4A3E" : "#FFFFFF",
            color: selected.includes(opt) ? "#FFFFFF" : "#1A1F1B",
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// MAIN ONBOARDING COMPONENT
// ============================================================
function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tgId = searchParams.get("tg");

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [computedMacros, setComputedMacros] = useState<ReturnType<typeof calculateMacros> | null>(null);

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
    allergies: [],
    dislikes: [],
    dislikes_notes: "",
    works_out: false,
    workout_type: "",
    workout_days: [],
    workout_time: "",
    region: null,
    budget_weekly: 2000,
    max_cooking_time: null,
    wake_time: "07:00",
    sleep_time: "23:00",
  });

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 1: return profile.goal !== null;
      case 2: return profile.height_cm > 0 && profile.weight_kg > 0 && profile.age > 0 && profile.sex !== null;
      case 3: return profile.activity_level !== null;
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return true;
      case 8: return profile.max_cooking_time !== null;
      case 9: return true;
      default: return true;
    }
  }

  async function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else if (step === TOTAL_STEPS - 1) {
      // Step 9 → step 10: compute macros then show reveal
      if (
        profile.height_cm && profile.weight_kg && profile.age &&
        profile.sex && profile.activity_level && profile.goal
      ) {
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
    setSubmitting(true);

    try {
      const payload = {
        telegramChatId: profile.telegramChatId,
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
        food_style_notes: profile.food_style_notes || null,
        allergies: profile.allergies,
        dislikes: profile.dislikes,
        dislikes_notes: profile.dislikes_notes || null,
        works_out: profile.works_out,
        workout_type: profile.works_out ? profile.workout_type : null,
        workout_days: profile.works_out ? profile.workout_days : [],
        workout_time: profile.works_out ? profile.workout_time : null,
        region: profile.region,
        budget_weekly: profile.budget_weekly,
        max_cooking_time: profile.max_cooking_time,
        wake_time: profile.wake_time,
        sleep_time: profile.sleep_time,
        // Computed macros
        bmi: computedMacros.bmi,
        bmr: computedMacros.bmr,
        tdee: computedMacros.tdee,
        target_kcal: computedMacros.target_kcal,
        target_protein_g: computedMacros.target_protein_g,
        target_carbs_g: computedMacros.target_carbs_g,
        target_fat_g: computedMacros.target_fat_g,
        onboarding_complete: true,
      };

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Redirect to Telegram after a short delay
        setTimeout(() => {
          window.location.href = "https://t.me/lockinfood_bot";
        }, 2500);
      }
    } catch (e) {
      console.error("Onboarding submit error:", e);
    } finally {
      setSubmitting(false);
    }
  }

  const bmiInfo = profile.height_cm && profile.weight_kg
    ? getBMILabel(
        Math.round((profile.weight_kg / Math.pow(profile.height_cm / 100, 2)) * 10) / 10
      )
    : null;

  const weeklyRate = profile.goal === "fat_loss" || profile.goal === "muscle_gain"
    ? profile.goal === "fat_loss"
      ? Math.min(profile.target_kg / profile.target_weeks, 1.0).toFixed(2)
      : "0.25"
    : null;

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#FAF8F3" }}>
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <span
            className="text-2xl font-bold"
            style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2D4A3E" }}
          >
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
              ].map((opt) => (
                <OptionButton
                  key={opt.value}
                  selected={profile.goal === opt.value}
                  onClick={() => update("goal", opt.value as Goal)}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{opt.desc}</div>
                </OptionButton>
              ))}
            </div>

            {/* Condition + target sliders for fat_loss / muscle_gain */}
            {profile.goal === "manage_condition" && (
              <div className="mt-4">
                <label className="text-sm font-medium" style={{ color: "#1A1F1B" }}>
                  Which condition?
                </label>
                <input
                  type="text"
                  placeholder="e.g. Diabetes, PCOS, thyroid..."
                  value={profile.condition}
                  onChange={(e) => update("condition", e.target.value)}
                  className="mt-2 w-full border rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC", backgroundColor: "#FFFFFF" }}
                />
              </div>
            )}

            {(profile.goal === "fat_loss" || profile.goal === "muscle_gain") && (
              <div className="mt-5 space-y-4 p-4 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
                {profile.goal === "fat_loss" && (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-1" style={{ color: "#1A1F1B" }}>
                        <span>Target loss</span>
                        <span className="font-semibold">{profile.target_kg} kg</span>
                      </div>
                      <input
                        type="range" min={1} max={40} step={1}
                        value={profile.target_kg}
                        onChange={(e) => update("target_kg", parseInt(e.target.value))}
                        className="w-full accent-[#2D4A3E]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1" style={{ color: "#1A1F1B" }}>
                        <span>Timeframe</span>
                        <span className="font-semibold">{profile.target_weeks} weeks</span>
                      </div>
                      <input
                        type="range" min={4} max={52} step={1}
                        value={profile.target_weeks}
                        onChange={(e) => update("target_weeks", parseInt(e.target.value))}
                        className="w-full accent-[#2D4A3E]"
                      />
                    </div>
                    {weeklyRate && (
                      <div
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: parseFloat(weeklyRate) > 0.75 ? "rgba(198,107,92,0.1)" : "rgba(123,160,136,0.15)",
                          color: parseFloat(weeklyRate) > 0.75 ? "#C66B5C" : "#2D4A3E",
                        }}
                      >
                        {parseFloat(weeklyRate) > 0.75
                          ? `⚠ ${weeklyRate} kg/week is aggressive. We'll cap at 1.0 kg/week for safety.`
                          : `✓ ${weeklyRate} kg/week — sustainable pace`}
                      </div>
                    )}
                  </>
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
                  <input
                    type="number" min={100} max={250}
                    value={profile.height_cm || ""}
                    onChange={(e) => update("height_cm", parseFloat(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#E8E4DC" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Weight (kg)</label>
                  <input
                    type="number" min={30} max={300} step={0.1}
                    value={profile.weight_kg || ""}
                    onChange={(e) => update("weight_kg", parseFloat(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#E8E4DC" }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Age</label>
                  <input
                    type="number" min={18} max={90}
                    value={profile.age || ""}
                    onChange={(e) => update("age", parseInt(e.target.value))}
                    className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "#E8E4DC" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Sex</label>
                  <div className="flex gap-2">
                    {(["male", "female", "other"] as Sex[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => update("sex", s)}
                        className="flex-1 py-3 rounded-xl text-xs font-medium border capitalize transition-all"
                        style={{
                          borderColor: profile.sex === s ? "#2D4A3E" : "#E8E4DC",
                          backgroundColor: profile.sex === s ? "#2D4A3E" : "#FFFFFF",
                          color: profile.sex === s ? "#FFFFFF" : "#1A1F1B",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live BMI */}
              {bmiInfo && profile.height_cm > 100 && profile.weight_kg > 0 && (
                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ backgroundColor: "#FAF8F3" }}
                >
                  <span className="text-sm" style={{ color: "#6B7268" }}>Your BMI</span>
                  <span className="font-bold text-lg">
                    {(profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)}
                    <span
                      className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${bmiInfo.color}20`, color: bmiInfo.color }}
                    >
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
              ].map((opt) => (
                <OptionButton
                  key={opt.value}
                  selected={profile.activity_level === opt.value}
                  onClick={() => update("activity_level", opt.value as ActivityLevel)}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{opt.desc}</div>
                </OptionButton>
              ))}
            </div>
          </StepCard>
        )}

        {/* ── Step 4: Fitness Routine ── */}
        {step === 4 && (
          <StepCard title="Do you work out?" subtitle="Workout days get +12% calories automatically.">
            <Toggle
              checked={profile.works_out}
              onChange={(v) => update("works_out", v)}
              label="Yes, I work out regularly"
            />

            {profile.works_out && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Workout type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Gym / Strength", "Cardio", "Yoga", "Sports", "Mixed"].map((t) => (
                      <OptionButton
                        key={t}
                        selected={profile.workout_type === t}
                        onClick={() => update("workout_type", t)}
                      >
                        {t}
                      </OptionButton>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Which days?</label>
                  <div className="flex flex-wrap gap-2">
                    {WORKOUT_DAYS_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const days = profile.workout_days.includes(d.toLowerCase())
                            ? profile.workout_days.filter((x) => x !== d.toLowerCase())
                            : [...profile.workout_days, d.toLowerCase()];
                          update("workout_days", days);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                        style={{
                          borderColor: profile.workout_days.includes(d.toLowerCase()) ? "#2D4A3E" : "#E8E4DC",
                          backgroundColor: profile.workout_days.includes(d.toLowerCase()) ? "#2D4A3E" : "#FFFFFF",
                          color: profile.workout_days.includes(d.toLowerCase()) ? "#FFFFFF" : "#1A1F1B",
                        }}
                      >
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Workout time</label>
                  <div className="flex gap-3">
                    {["Morning", "Evening"].map((t) => (
                      <OptionButton
                        key={t}
                        selected={profile.workout_time === t.toLowerCase()}
                        onClick={() => update("workout_time", t.toLowerCase())}
                      >
                        {t}
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
              <Toggle
                checked={profile.okay_with_dairy}
                onChange={(v) => update("okay_with_dairy", v)}
                label="Okay with dairy"
                description="Milk, curd, paneer, cheese"
              />
              <Toggle
                checked={profile.okay_with_eggs}
                onChange={(v) => update("okay_with_eggs", v)}
                label="Okay with eggs"
                description="Egg whites, whole eggs, egg dishes"
              />
              <Toggle
                checked={profile.okay_with_meat_fish}
                onChange={(v) => update("okay_with_meat_fish", v)}
                label="Okay with meat & fish"
                description="Chicken, mutton, fish, seafood"
              />
            </div>
          </StepCard>
        )}

        {/* ── Step 6: Food Style ── */}
        {step === 6 && (
          <StepCard title="Food style" subtitle="What kind of food do you usually eat?">
            <TagSelector
              options={FOOD_STYLE_OPTIONS}
              selected={profile.food_style}
              onChange={(v) => update("food_style", v)}
            />
            <div className="mt-5">
              <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                Anything else about your food access?
              </label>
              <textarea
                rows={3}
                placeholder="e.g. I live in a hostel with limited cooking, I only eat home food, I'm from Rajasthan so no garlic/onion..."
                value={profile.food_style_notes}
                onChange={(e) => update("food_style_notes", e.target.value)}
                className="w-full border rounded-xl px-4 py-3 text-sm outline-none resize-none"
                style={{ borderColor: "#E8E4DC" }}
              />
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Region</label>
              <div className="grid grid-cols-3 gap-2">
                {(["north", "south", "east", "west", "other"] as Region[]).map((r) => (
                  <OptionButton
                    key={r}
                    selected={profile.region === r}
                    onClick={() => update("region", r)}
                  >
                    <span className="capitalize">{r}</span>
                  </OptionButton>
                ))}
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
                <TagSelector
                  options={ALLERGY_OPTIONS}
                  selected={profile.allergies}
                  onChange={(v) => update("allergies", v)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Dislikes</label>
                <TagSelector
                  options={DISLIKE_OPTIONS}
                  selected={profile.dislikes}
                  onChange={(v) => update("dislikes", v)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Any nuance? (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Can eat eggs but not scrambled, okay with fish but not prawns..."
                  value={profile.dislikes_notes}
                  onChange={(e) => update("dislikes_notes", e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ borderColor: "#E8E4DC" }}
                />
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 8: Budget & Cooking Time ── */}
        {step === 8 && (
          <StepCard title="Budget & time" subtitle="Realistic plans for your kitchen.">
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-2" style={{ color: "#1A1F1B" }}>
                  <span>Weekly grocery budget</span>
                  <span className="font-semibold">₹{profile.budget_weekly.toLocaleString()}</span>
                </div>
                <input
                  type="range" min={500} max={10000} step={500}
                  value={profile.budget_weekly}
                  onChange={(e) => update("budget_weekly", parseInt(e.target.value))}
                  className="w-full accent-[#2D4A3E]"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "#6B7268" }}>
                  <span>₹500</span><span>₹10,000</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>
                  Max cooking time per meal
                </label>
                <div className="space-y-2">
                  {[
                    { value: "under_15", label: "Under 15 minutes", desc: "Quick assembly, minimal cooking" },
                    { value: "15_30", label: "15–30 minutes", desc: "Standard home cooking" },
                    { value: "30_45", label: "30–45 minutes", desc: "Proper cooking sessions" },
                    { value: "45_plus", label: "45+ minutes", desc: "I enjoy cooking, no rush" },
                  ].map((opt) => (
                    <OptionButton
                      key={opt.value}
                      selected={profile.max_cooking_time === opt.value}
                      onClick={() => update("max_cooking_time", opt.value as CookingTime)}
                    >
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs" style={{ color: "#6B7268" }}>{opt.desc}</div>
                    </OptionButton>
                  ))}
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 9: Schedule ── */}
        {step === 9 && (
          <StepCard title="Your schedule" subtitle="We'll time your meals around your day.">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Wake time</label>
                <input
                  type="time"
                  value={profile.wake_time}
                  onChange={(e) => update("wake_time", e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: "#1A1F1B" }}>Sleep time</label>
                <input
                  type="time"
                  value={profile.sleep_time}
                  onChange={(e) => update("sleep_time", e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC" }}
                />
              </div>
            </div>
          </StepCard>
        )}

        {/* ── Step 10: Reveal ── */}
        {step === 10 && computedMacros && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-8 text-center"
              style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}
            >
              <div
                className="text-4xl font-bold mb-1"
                style={{ fontFamily: "Fraunces, Georgia, serif" }}
              >
                You&apos;re locked in. 🔒
              </div>
              <p className="text-sm mt-2" style={{ color: "#7BA088" }}>
                Your personalised targets are ready.
              </p>
            </div>

            {/* Macro cards */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
              {/* BMI */}
              <div className="mb-5 pb-5" style={{ borderBottom: "1px solid #F0EDE6" }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "#6B7268" }}>Your BMI</span>
                  <span>
                    <span className="text-2xl font-bold" style={{ color: "#1A1F1B" }}>{computedMacros.bmi}</span>
                    <span
                      className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${getBMILabel(computedMacros.bmi).color}20`,
                        color: getBMILabel(computedMacros.bmi).color,
                      }}
                    >
                      {getBMILabel(computedMacros.bmi).label}
                    </span>
                  </span>
                </div>
              </div>

              {/* Calorie target — PROMINENT */}
              <div
                className="rounded-xl p-5 mb-4 text-center"
                style={{ backgroundColor: "rgba(45,74,62,0.06)" }}
              >
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#5A7A6B" }}>
                  Daily calorie target
                </div>
                <div className="text-5xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
                  {computedMacros.target_kcal.toLocaleString()}
                </div>
                <div className="text-sm mt-1" style={{ color: "#6B7268" }}>
                  kcal/day &nbsp;·&nbsp; {computedMacros.workout_day_kcal.toLocaleString()} kcal on workout days
                </div>
              </div>

              {/* Macros */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Protein", value: computedMacros.target_protein_g, unit: "g", color: "#E89B7C" },
                  { label: "Carbs", value: computedMacros.target_carbs_g, unit: "g", color: "#D4A574" },
                  { label: "Fat", value: computedMacros.target_fat_g, unit: "g", color: "#7BA088" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl p-3 text-center"
                    style={{ backgroundColor: "#FAF8F3" }}
                  >
                    <div className="text-2xl font-bold" style={{ color: m.color }}>
                      {m.value}
                      <span className="text-sm">{m.unit}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {/* TDEE */}
              <div className="mt-4 text-center text-xs" style={{ color: "#6B7268" }}>
                TDEE: {computedMacros.tdee.toLocaleString()} kcal &nbsp;·&nbsp; BMR: {computedMacros.bmr.toLocaleString()} kcal
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-2xl font-semibold text-white transition-colors"
              style={{ backgroundColor: submitting ? "#5A7A6B" : "#2D4A3E" }}
            >
              {submitting ? "Saving your profile..." : "Save & open Telegram →"}
            </button>

            <p className="text-center text-xs" style={{ color: "#6B7268" }}>
              After saving, go to Telegram and send /plan to generate your first week.
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        {step < TOTAL_STEPS && (
          <div className="mt-6 flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex-1 py-4 rounded-2xl font-medium border transition-colors"
                style={{ borderColor: "#E8E4DC", color: "#6B7268" }}
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance()}
              className="flex-1 py-4 rounded-2xl font-semibold text-white transition-colors"
              style={{ backgroundColor: canAdvance() ? "#2D4A3E" : "#B0BDB8" }}
            >
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
        <div className="text-center" style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

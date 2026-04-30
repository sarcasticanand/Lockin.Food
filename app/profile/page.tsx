"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { calculateMacros } from "@/lib/macro-calculator";

interface UserProfile {
  id: string;
  telegram_username?: string;
  goal?: string;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  sex?: string;
  activity_level?: string;
  okay_with_dairy?: boolean;
  okay_with_eggs?: boolean;
  okay_with_meat_fish?: boolean;
  food_style?: string[];
  food_style_notes?: string;
  allergies?: string[];
  dislikes?: string[];
  dislikes_notes?: string;
  works_out?: boolean;
  workout_type?: string;
  workout_days?: string[];
  region?: string;
  budget_weekly?: number;
  max_cooking_time?: string;
  target_kcal?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
  bmi?: number;
  current_streak?: number;
}

function ProfileContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [edits, setEdits] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    fetch(`/api/profile?uid=${uid}`)
      .then((r) => r.json())
      .then((d) => { setUser(d.user); setEdits(d.user || {}); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [uid]);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setEdits((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    if (!uid || !user) return;
    setSaving(true);
    try {
      // Recalculate macros if body stats or goal changed
      let macros = {};
      if (edits.height_cm && edits.weight_kg && edits.age && edits.sex && edits.activity_level && edits.goal) {
        const computed = calculateMacros({
          height_cm: edits.height_cm,
          weight_kg: edits.weight_kg,
          age: edits.age,
          sex: edits.sex,
          activity_level: edits.activity_level,
          goal: edits.goal,
        });
        macros = {
          bmi: computed.bmi,
          bmr: computed.bmr,
          tdee: computed.tdee,
          target_kcal: computed.target_kcal,
          target_protein_g: computed.target_protein_g,
          target_carbs_g: computed.target_carbs_g,
          target_fat_g: computed.target_fat_g,
        };
      }

      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, ...edits, ...macros }),
      });
      setUser({ ...user, ...edits, ...macros });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
      <div style={{ color: "#2D4A3E" }}>Loading...</div>
    </div>
  );

  const e = edits;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#FAF8F3" }}>
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
            Profile
          </h1>
          {uid && <Link href={`/dashboard?uid=${uid}`} className="text-sm" style={{ color: "#2D4A3E" }}>← Dashboard</Link>}
        </div>
        <p className="text-sm" style={{ color: "#6B7268" }}>Changes recalculate your targets.</p>
      </div>

      {!user ? (
        <div className="px-5 text-center py-12">
          <p style={{ color: "#6B7268" }}>Profile not found.</p>
          <Link href="/onboarding" className="mt-4 inline-block text-sm font-medium" style={{ color: "#2D4A3E" }}>
            Set up profile →
          </Link>
        </div>
      ) : (
        <div className="px-5 space-y-4">
          {/* Current targets */}
          <div className="rounded-2xl p-5" style={{ backgroundColor: "#2D4A3E", color: "#FFFFFF" }}>
            <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#7BA088" }}>Current targets</div>
            <div className="text-center mb-3">
              <div className="text-4xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif" }}>
                {(e.target_kcal || user.target_kcal || 0).toLocaleString()}
              </div>
              <div className="text-sm" style={{ color: "#7BA088" }}>kcal/day</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { label: "Protein", value: e.target_protein_g || user.target_protein_g || 0, unit: "g" },
                { label: "Carbs", value: e.target_carbs_g || user.target_carbs_g || 0, unit: "g" },
                { label: "Fat", value: e.target_fat_g || user.target_fat_g || 0, unit: "g" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg p-2" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                  <div className="font-bold">{m.value}{m.unit}</div>
                  <div style={{ color: "#7BA088" }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Goal */}
          <Section title="Goal">
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "fat_loss", label: "Fat loss" },
                { value: "muscle_gain", label: "Muscle gain" },
                { value: "clean_eating", label: "Clean eating" },
                { value: "manage_condition", label: "Manage condition" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("goal", opt.value)}
                  className="py-2.5 rounded-xl text-sm font-medium border transition-all"
                  style={{
                    borderColor: e.goal === opt.value ? "#2D4A3E" : "#E8E4DC",
                    backgroundColor: e.goal === opt.value ? "#2D4A3E" : "#FFFFFF",
                    color: e.goal === opt.value ? "#FFFFFF" : "#1A1F1B",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Body stats */}
          <Section title="Body stats">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height (cm)" type="number" value={String(e.height_cm || "")} onChange={(v) => update("height_cm", parseFloat(v))} />
              <Field label="Weight (kg)" type="number" value={String(e.weight_kg || "")} onChange={(v) => update("weight_kg", parseFloat(v))} />
              <Field label="Age" type="number" value={String(e.age || "")} onChange={(v) => update("age", parseInt(v))} />
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Sex</label>
                <select
                  value={e.sex || ""}
                  onChange={(t) => update("sex", t.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "#E8E4DC" }}
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </Section>

          {/* Food preferences */}
          <Section title="Food preferences">
            <div className="space-y-2">
              {[
                { key: "okay_with_dairy" as keyof UserProfile, label: "Dairy" },
                { key: "okay_with_eggs" as keyof UserProfile, label: "Eggs" },
                { key: "okay_with_meat_fish" as keyof UserProfile, label: "Meat & Fish" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#FAF8F3" }}>
                  <span className="text-sm" style={{ color: "#1A1F1B" }}>Okay with {label}</span>
                  <button
                    type="button"
                    onClick={() => update(key, !e[key])}
                    className="relative inline-flex h-5 w-10 rounded-full transition-colors"
                    style={{ backgroundColor: e[key] ? "#2D4A3E" : "#D1D5DB" }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5"
                      style={{ transform: e[key] ? "translateX(1.25rem)" : "translateX(0.125rem)" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          {/* Weekly budget */}
          <Section title="Budget & region">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: "#6B7268" }}>Weekly budget</span>
                <span className="font-semibold">₹{(e.budget_weekly || 2000).toLocaleString()}</span>
              </div>
              <input
                type="range" min={500} max={10000} step={500}
                value={e.budget_weekly || 2000}
                onChange={(ev) => update("budget_weekly", parseInt(ev.target.value))}
                className="w-full accent-[#2D4A3E]"
              />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>Region</label>
              <select
                value={e.region || ""}
                onChange={(t) => update("region", t.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "#E8E4DC" }}
              >
                {["north", "south", "east", "west", "other"].map((r) => (
                  <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </Section>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-semibold text-white transition-colors"
            style={{ backgroundColor: saving ? "#5A7A6B" : "#2D4A3E" }}
          >
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save changes"}
          </button>

          {/* Danger zone */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(198,107,92,0.08)" }}>
            <div className="text-sm font-semibold mb-1" style={{ color: "#C66B5C" }}>Delete all data</div>
            <p className="text-xs mb-3" style={{ color: "#6B7268" }}>
              To permanently delete your profile and all history, open Telegram and send /deletedata.
            </p>
            <a
              href="https://t.me/lockinfood_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium"
              style={{ color: "#C66B5C" }}
            >
              Open Telegram →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
      <div className="text-sm font-semibold mb-4" style={{ color: "#1A1F1B" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: "#6B7268" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: "#E8E4DC" }}
      />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}

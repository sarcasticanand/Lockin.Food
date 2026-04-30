"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface MacroProgress {
  kcal: { current: number; target: number };
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
}

interface SlotItem {
  time: string;
  name: string;
  kcal?: number;
  protein_g?: number;
  plate_totals?: { kcal: number; protein_g: number };
}

interface DashboardData {
  user: {
    telegram_username: string;
    current_streak: number;
    target_kcal: number;
    target_protein_g: number;
    target_carbs_g: number;
    target_fat_g: number;
  };
  todaySlots: Record<string, SlotItem> | null;
  log: MacroProgress;
  pantryAlerts: number;
}

function MacroBar({ label, current, target, color }: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span style={{ color: "#6B7268" }}>{label}</span>
        <span className="font-semibold" style={{ color: "#1A1F1B" }}>{current} / {target}{label === "Calories" ? " kcal" : "g"}</span>
      </div>
      <div className="h-2 rounded-full" style={{ backgroundColor: "#E8E4DC" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const SLOT_LABELS: Record<string, { emoji: string; label: string }> = {
  early_morning: { emoji: "🌅", label: "Early Morning" },
  breakfast: { emoji: "🍳", label: "Breakfast" },
  mid_morning: { emoji: "🍎", label: "Mid-Morning" },
  lunch: { emoji: "🍱", label: "Lunch" },
  evening_snack: { emoji: "☕", label: "Evening Snack" },
  dinner: { emoji: "🌙", label: "Dinner" },
  pre_bed: { emoji: "🌛", label: "Pre-Bed" },
};

function DashboardContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("uid");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`/api/dashboard?uid=${userId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div className="text-center" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif", fontSize: 24 }}>
          Loading your day...
        </div>
      </div>
    );
  }

  if (!userId || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF8F3" }}>
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2D4A3E" }}>
            Welcome to Lockin
          </h1>
          <p className="mb-6" style={{ color: "#6B7268" }}>Set up your profile to see your dashboard.</p>
          <Link
            href="/onboarding"
            className="inline-block px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#2D4A3E" }}
          >
            Set up profile →
          </Link>
        </div>
      </div>
    );
  }

  const { user, todaySlots, log } = data;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#FAF8F3" }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
              Hey {user.telegram_username || "there"} 👋
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#6B7268" }}>{dateStr}</p>
          </div>
          <div
            className="text-center px-4 py-2 rounded-xl"
            style={{ backgroundColor: "rgba(45,74,62,0.08)" }}
          >
            <div className="text-2xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
              {user.current_streak}
            </div>
            <div className="text-xs" style={{ color: "#5A7A6B" }}>day streak 🔥</div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Macro progress */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#1A1F1B" }}>Today&apos;s macros</h2>
          <div className="space-y-4">
            <MacroBar label="Calories" current={log.kcal.current} target={log.kcal.target} color="#2D4A3E" />
            <MacroBar label="Protein" current={log.protein.current} target={log.protein.target} color="#E89B7C" />
            <MacroBar label="Carbs" current={log.carbs.current} target={log.carbs.target} color="#D4A574" />
            <MacroBar label="Fat" current={log.fat.current} target={log.fat.target} color="#7BA088" />
          </div>
        </div>

        {/* Today's meal timeline */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: "#1A1F1B" }}>Today&apos;s meals</h2>
            <Link href={`/plan?uid=${userId}`} className="text-xs font-medium" style={{ color: "#2D4A3E" }}>
              Full week →
            </Link>
          </div>

          {todaySlots ? (
            <div className="space-y-3">
              {Object.entries(SLOT_LABELS).map(([slot, info]) => {
                const item = todaySlots[slot];
                if (!item) return null;
                const kcal = item.plate_totals?.kcal ?? item.kcal ?? 0;
                const protein = item.plate_totals?.protein_g ?? item.protein_g ?? 0;
                return (
                  <div key={slot} className="flex items-start gap-3">
                    <div className="pt-0.5 text-lg w-7 flex-shrink-0">{info.emoji}</div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm" style={{ color: "#1A1F1B" }}>{item.name}</span>
                        <span className="text-xs" style={{ color: "#6B7268" }}>{kcal} kcal · {protein}g P</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{item.time} · {info.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm mb-3" style={{ color: "#6B7268" }}>No meal plan generated yet.</p>
              <p className="text-xs" style={{ color: "#5A7A6B" }}>Open Telegram and send /plan</p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: `/shop?uid=${userId}`, icon: "🛒", label: "Shopping list" },
            { href: `/pantry?uid=${userId}`, icon: "🧺", label: "Pantry" },
            { href: `/plan?uid=${userId}`, icon: "📅", label: "Week plan" },
            { href: `/profile?uid=${userId}`, icon: "⚙️", label: "Profile" },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-2xl p-4 flex items-center gap-3 transition-colors"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}
            >
              <span className="text-xl">{a.icon}</span>
              <span className="font-medium text-sm" style={{ color: "#1A1F1B" }}>{a.label}</span>
            </Link>
          ))}
        </div>

        {/* Telegram CTA */}
        <a
          href="https://t.me/lockinfood_bot"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl p-4 text-center font-semibold text-white transition-colors"
          style={{ backgroundColor: "#2D4A3E" }}
        >
          Open Telegram to chat with Lockin →
        </a>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

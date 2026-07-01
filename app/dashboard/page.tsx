"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────
interface Slot {
  slot: string;
  time?: string;
  meal: string;
  kcal: number;
  protein_g: number;
  carbs_g?: number;
  fat_g?: number;
  prep_time_min?: number;
  ingredients?: string[];
}

interface Day {
  day_index: number;
  day_name: string;
  is_workout_day?: boolean;
  total_kcal?: number;
  slots: Slot[];
}

interface User {
  id: string;
  telegram_username?: string;
  current_streak: number;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  goal?: string;
}

interface Log {
  kcal: { current: number; target: number };
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
}

interface DashData {
  user: User;
  todaySlots: Slot[] | null;
  todayIsWorkout: boolean;
  log: Log;
  weekPlan: Day[] | null;
}

// ─── Components ──────────────────────────────────────────────
function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
  const unit = label === "Calories" ? " kcal" : "g";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: "#6B7268" }}>
        <span>{label}</span>
        <span className="font-semibold" style={{ color: "#1A1F1B" }}>{current}{unit} <span style={{ color: "#9BA89A" }}>/ {target}{unit}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EDE6" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const SLOT_META: Record<string, { emoji: string; label: string }> = {
  early_morning: { emoji: "🌅", label: "Early Morning" },
  breakfast:     { emoji: "🍳", label: "Breakfast" },
  mid_morning:   { emoji: "🍎", label: "Mid-Morning" },
  lunch:         { emoji: "🍱", label: "Lunch" },
  evening_snack: { emoji: "☕", label: "Evening Snack" },
  dinner:        { emoji: "🌙", label: "Dinner" },
  pre_bed:       { emoji: "🌛", label: "Pre-Bed" },
};

function SlotCard({ slot, userId, onLog }: { slot: Slot; userId: string; onLog: () => void }) {
  const [status, setStatus] = useState<"pending" | "eaten" | "skipped">("pending");
  const [swapping, setSwapping] = useState(false);
  const [alternatives, setAlternatives] = useState<string[] | null>(null);
  const meta = SLOT_META[slot.slot] || { emoji: "🍽️", label: slot.slot };

  async function markEaten() {
    setStatus("eaten");
    await fetch("/api/log-meal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, slot: slot.slot, meal: slot.meal, kcal: slot.kcal, protein_g: slot.protein_g }),
    }).catch(() => {});
    onLog();
  }

  async function getSwaps() {
    setSwapping(true);
    setAlternatives(null);
    try {
      const res = await fetch("/api/swap-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, slot: slot.slot, currentMeal: slot.meal }),
      });
      const data = await res.json();
      setAlternatives(data.alternatives || []);
    } catch {
      setAlternatives(["Could not load alternatives. Try again."]);
    }
    setSwapping(false);
  }

  return (
    <div
      className="rounded-2xl p-4 transition-all"
      style={{
        backgroundColor: status === "eaten" ? "rgba(45,74,62,0.05)" : "#FFFFFF",
        boxShadow: "0 1px 8px rgba(45,74,62,0.06)",
        opacity: status === "skipped" ? 0.5 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0 pt-0.5">{meta.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#5A7A6B" }}>
                {meta.label}{slot.time && <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: "#9BA89A" }}>{slot.time}</span>}
              </span>
              <p className="text-sm font-medium mt-0.5 leading-snug" style={{ color: "#1A1F1B", textDecoration: status === "skipped" ? "line-through" : "none" }}>
                {slot.meal}
              </p>
            </div>
            {status === "eaten" && <span className="text-green-600 text-lg flex-shrink-0">✓</span>}
          </div>

          <div className="flex gap-3 mt-1.5 text-xs" style={{ color: "#9BA89A" }}>
            <span>{slot.kcal} kcal</span>
            <span>·</span>
            <span>{slot.protein_g}g protein</span>
            {slot.carbs_g != null && <><span>·</span><span>{slot.carbs_g}g carbs</span></>}
            {slot.fat_g != null && <><span>·</span><span>{slot.fat_g}g fat</span></>}
            {slot.prep_time_min != null && slot.prep_time_min > 0 && <><span>·</span><span>{slot.prep_time_min} min</span></>}
          </div>

          {slot.ingredients && slot.ingredients.length > 0 && (
            <p className="text-xs mt-1.5" style={{ color: "#9BA89A" }}>
              {slot.ingredients.join(", ")}
            </p>
          )}

          {status === "pending" && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={markEaten}
                className="flex-1 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors"
                style={{ backgroundColor: "#2D4A3E" }}
              >
                ✓ Eaten
              </button>
              <button
                onClick={getSwaps}
                disabled={swapping}
                className="flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                style={{ borderColor: "#E8E4DC", color: "#6B7268" }}
              >
                {swapping ? "Loading..." : "↔ Swap"}
              </button>
              <button
                onClick={() => setStatus("skipped")}
                className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                style={{ borderColor: "#E8E4DC", color: "#9BA89A" }}
              >
                Skip
              </button>
            </div>
          )}

          {alternatives && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold" style={{ color: "#5A7A6B" }}>Alternatives:</p>
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  className="w-full text-left text-xs px-3 py-2 rounded-xl border transition-all"
                  style={{ borderColor: "#E8E4DC", color: "#1A1F1B", backgroundColor: "#FAF8F3" }}
                  onClick={() => setAlternatives(null)}
                >
                  {alt}
                </button>
              ))}
              <button onClick={() => setAlternatives(null)} className="text-xs" style={{ color: "#9BA89A" }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ──────────────────────────────────────────
function DashboardContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("uid");

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"today" | "week">("today");
  const [activeWeekDay, setActiveWeekDay] = useState(new Date().getDay());
  const [logVersion, setLogVersion] = useState(0);

  function refetchLog() { setLogVersion(v => v + 1); }

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/dashboard?uid=${userId}`)
      .then(r => r.json())
      .then(raw => {
        // Normalise: todaySlots may be an object (old format) or array (new format)
        let todaySlots: Slot[] | null = null;
        if (Array.isArray(raw.todaySlots)) {
          todaySlots = raw.todaySlots;
        } else if (raw.todaySlots && typeof raw.todaySlots === "object") {
          todaySlots = Object.entries(raw.todaySlots).map(([slot, item]) => ({
            slot,
            ...(item as object),
          })) as Slot[];
        }
        setData({ ...raw, todaySlots });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, logVersion]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <p style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif", fontSize: 20 }}>Loading your day...</p>
        </div>
      </div>
    );
  }

  if (!userId || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF8F3" }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#2D4A3E" }}>
            Welcome to Lockin
          </h1>
          <p className="mb-6 text-sm" style={{ color: "#6B7268" }}>Set up your profile to see your personalised meal plan.</p>
          <Link href="/onboarding" className="inline-block px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: "#2D4A3E" }}>
            Set up profile →
          </Link>
        </div>
      </div>
    );
  }

  const { user, todaySlots, todayIsWorkout, log, weekPlan } = data;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const activeDayData = weekPlan?.[activeWeekDay];

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#FAF8F3" }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-5" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #F0EDE6" }}>
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#5A7A6B" }}>
              {dateStr}
            </p>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
              {user.telegram_username ? `Hey @${user.telegram_username}` : "Hey there"} 👋
            </h1>
            {todayIsWorkout && (
              <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(45,74,62,0.1)", color: "#2D4A3E" }}>
                💪 Workout day
              </span>
            )}
          </div>
          <div className="text-center px-4 py-2 rounded-2xl" style={{ backgroundColor: "rgba(45,74,62,0.08)" }}>
            <div className="text-2xl font-bold" style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif" }}>
              {user.current_streak}
            </div>
            <div className="text-xs" style={{ color: "#5A7A6B" }}>🔥 streak</div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-5 space-y-4">
        {/* Macro progress */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color: "#1A1F1B" }}>Today&apos;s macros</h2>
            <span className="text-xs" style={{ color: "#9BA89A" }}>
              {log.kcal.target > 0 ? Math.round((log.kcal.current / log.kcal.target) * 100) : 0}% of daily target
            </span>
          </div>
          <div className="space-y-3">
            <MacroBar label="Calories" current={log.kcal.current} target={log.kcal.target} color="#2D4A3E" />
            <MacroBar label="Protein" current={log.protein.current} target={log.protein.target} color="#E89B7C" />
            <MacroBar label="Carbs" current={log.carbs.current} target={log.carbs.target} color="#D4A574" />
            <MacroBar label="Fat" current={log.fat.current} target={log.fat.target} color="#7BA088" />
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2 p-1 rounded-2xl" style={{ backgroundColor: "#E8E4DC" }}>
          {(["today", "week"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition-all"
              style={{
                backgroundColor: activeTab === tab ? "#FFFFFF" : "transparent",
                color: activeTab === tab ? "#1A1F1B" : "#6B7268",
                boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {tab === "today" ? "Today's meals" : "Week plan"}
            </button>
          ))}
        </div>

        {/* TODAY tab */}
        {activeTab === "today" && (
          <div className="space-y-3">
            {!todaySlots || todaySlots.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 12px rgba(45,74,62,0.06)" }}>
                <div className="text-3xl mb-3">🍽️</div>
                <p className="text-sm font-medium mb-1" style={{ color: "#1A1F1B" }}>No meal plan yet</p>
                <p className="text-xs mb-4" style={{ color: "#6B7268" }}>Your plan is still generating — check back in a moment.</p>
                <button onClick={() => setLogVersion(v => v + 1)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: "#2D4A3E" }}>
                  Refresh
                </button>
              </div>
            ) : (
              todaySlots.map(slot => (
                <SlotCard key={slot.slot} slot={slot} userId={userId!} onLog={refetchLog} />
              ))
            )}
          </div>
        )}

        {/* WEEK tab */}
        {activeTab === "week" && (
          <div className="space-y-3">
            {/* Day selector */}
            <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {DAY_LABELS.map((d, i) => {
                const dayData = weekPlan?.[i];
                return (
                  <button key={d} onClick={() => setActiveWeekDay(i)}
                    className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: activeWeekDay === i ? "#2D4A3E" : "#FFFFFF",
                      color: activeWeekDay === i ? "#FFFFFF" : "#6B7268",
                      minWidth: 44,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}>
                    {d}
                    {dayData?.is_workout_day && <div style={{ fontSize: 9 }}>💪</div>}
                  </button>
                );
              })}
            </div>

            {!weekPlan ? (
              <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#FFFFFF" }}>
                <p className="text-sm" style={{ color: "#6B7268" }}>Week plan not loaded yet.</p>
              </div>
            ) : activeDayData ? (
              <div className="space-y-3">
                {activeDayData.is_workout_day && (
                  <div className="text-xs px-3 py-2 rounded-xl font-medium" style={{ backgroundColor: "rgba(45,74,62,0.08)", color: "#2D4A3E" }}>
                    💪 Workout day — {activeDayData.total_kcal?.toLocaleString()} kcal target
                  </div>
                )}
                {activeDayData.slots?.map(slot => {
                  const meta = SLOT_META[slot.slot] || { emoji: "🍽️", label: slot.slot };
                  return (
                    <div key={slot.slot} className="rounded-2xl p-4" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 8px rgba(45,74,62,0.06)" }}>
                      <div className="flex items-start gap-3">
                        <span className="text-lg">{meta.emoji}</span>
                        <div className="flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#5A7A6B" }}>
                            {meta.label}{slot.time && <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: "#9BA89A" }}>{slot.time}</span>}
                          </p>
                          <p className="text-sm font-medium mt-0.5" style={{ color: "#1A1F1B" }}>{slot.meal}</p>
                          <div className="flex gap-3 mt-1 text-xs" style={{ color: "#9BA89A" }}>
                            <span>{slot.kcal} kcal</span>
                            <span>·</span>
                            <span>{slot.protein_g}g P</span>
                            {slot.carbs_g != null && <><span>·</span><span>{slot.carbs_g}g C</span></>}
                            {slot.fat_g != null && <><span>·</span><span>{slot.fat_g}g F</span></>}
                          </div>
                          {slot.ingredients && slot.ingredients.length > 0 && (
                            <p className="text-xs mt-1" style={{ color: "#9BA89A" }}>{slot.ingredients.join(", ")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* Quick nav */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            { href: `/shop?uid=${userId}`, icon: "🛒", label: "Shopping" },
            { href: `/pantry?uid=${userId}`, icon: "🧺", label: "Pantry" },
            { href: `/profile?uid=${userId}`, icon: "⚙️", label: "Profile" },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className="rounded-2xl p-4 flex flex-col items-center gap-1 transition-colors"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 8px rgba(45,74,62,0.05)" }}>
              <span className="text-xl">{a.icon}</span>
              <span className="text-xs font-medium" style={{ color: "#6B7268" }}>{a.label}</span>
            </Link>
          ))}
        </div>

        {user.telegram_username ? (
          <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "rgba(45,74,62,0.06)" }}>
            <p className="text-xs" style={{ color: "#5A7A6B" }}>
              Daily briefings sent to <strong>@{user.telegram_username}</strong> on Telegram
            </p>
          </div>
        ) : (
          <a href={`https://t.me/kanshi_bot?start=${userId}`} target="_blank" rel="noreferrer"
            className="block rounded-2xl p-4 text-center font-semibold text-white"
            style={{ backgroundColor: "#2D4A3E" }}>
            Connect Telegram for daily reminders →
          </a>
        )}
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

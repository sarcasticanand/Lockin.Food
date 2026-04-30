"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface SlotItem {
  time: string;
  name: string;
  kcal?: number;
  protein_g?: number;
  plate_totals?: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  components?: { role: string; name: string; kcal: number; protein_g: number }[];
  why_this_plate?: string;
}

interface DayPlan {
  day: string;
  is_workout_day: boolean;
  target_kcal: number;
  slots: Record<string, SlotItem>;
  day_totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SLOT_LABELS: Record<string, { emoji: string; label: string }> = {
  early_morning: { emoji: "🌅", label: "Early Morning" },
  breakfast: { emoji: "🍳", label: "Breakfast" },
  mid_morning: { emoji: "🍎", label: "Mid-Morning" },
  lunch: { emoji: "🍱", label: "Lunch" },
  evening_snack: { emoji: "☕", label: "Snack" },
  dinner: { emoji: "🌙", label: "Dinner" },
  pre_bed: { emoji: "🌛", label: "Pre-Bed" },
};

function PlanContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const [days, setDays] = useState<DayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const todayIndex = new Date().getDay();
  const [activeDay, setActiveDay] = useState(todayIndex);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    fetch(`/api/plan?uid=${uid}`)
      .then((r) => r.json())
      .then((d) => setDays(d.days || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [uid]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
      <div style={{ color: "#2D4A3E", fontFamily: "Fraunces, Georgia, serif", fontSize: 20 }}>Loading your plan...</div>
    </div>
  );

  const currentDay = days[activeDay];

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#FAF8F3" }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
            This week&apos;s plan
          </h1>
          {uid && (
            <Link href={`/dashboard?uid=${uid}`} className="text-sm" style={{ color: "#2D4A3E" }}>← Dashboard</Link>
          )}
        </div>

        {/* Day tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {DAYS.map((d, i) => {
            const dayData = days[i];
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDay(i)}
                className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  backgroundColor: activeDay === i ? "#2D4A3E" : "#FFFFFF",
                  color: activeDay === i ? "#FFFFFF" : "#1A1F1B",
                  boxShadow: activeDay === i ? "none" : "0 1px 4px rgba(45,74,62,0.08)",
                }}
              >
                <div>{d.slice(0, 3).toUpperCase()}</div>
                {i === todayIndex && <div style={{ fontSize: 9, color: activeDay === i ? "#7BA088" : "#2D4A3E" }}>TODAY</div>}
                {dayData?.is_workout_day && <div style={{ fontSize: 9, color: activeDay === i ? "#E89B7C" : "#E89B7C" }}>💪</div>}
              </button>
            );
          })}
        </div>
      </div>

      {currentDay ? (
        <div className="px-5 space-y-3">
          {/* Day summary */}
          <div className="rounded-2xl p-4 flex justify-between items-center" style={{ backgroundColor: currentDay.is_workout_day ? "rgba(232,155,124,0.12)" : "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
            <div>
              <div className="font-semibold capitalize" style={{ color: "#1A1F1B" }}>
                {currentDay.day} {currentDay.is_workout_day && "💪"}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>
                Target: {currentDay.target_kcal.toLocaleString()} kcal
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-bold" style={{ color: "#2D4A3E" }}>{currentDay.day_totals.protein_g}g</div>
              <div className="text-xs" style={{ color: "#6B7268" }}>protein</div>
            </div>
          </div>

          {/* Slots */}
          {Object.entries(SLOT_LABELS).map(([slot, info]) => {
            const item = currentDay.slots?.[slot];
            if (!item) return null;
            const kcal = item.plate_totals?.kcal ?? item.kcal ?? 0;
            const protein = item.plate_totals?.protein_g ?? item.protein_g ?? 0;
            const isComposed = !!item.components;
            const isOpen = expandedSlot === `${activeDay}-${slot}`;

            return (
              <div key={slot} className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-4 flex items-start gap-3"
                  onClick={() => setExpandedSlot(isOpen ? null : `${activeDay}-${slot}`)}
                >
                  <span className="text-xl pt-0.5">{info.emoji}</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5A7A6B" }}>{info.label}</div>
                        <div className="font-semibold mt-0.5" style={{ color: "#1A1F1B" }}>{item.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{item.time}</div>
                      </div>
                      <div className="text-right ml-3">
                        <div className="text-sm font-bold" style={{ color: "#1A1F1B" }}>{kcal} kcal</div>
                        <div className="text-xs" style={{ color: "#E89B7C" }}>{protein}g P</div>
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "#6B7268", marginTop: 4 }}>{isOpen ? "▲" : "▼"}</span>
                </button>

                {/* Expanded view */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: "#F0EDE6" }}>
                    {isComposed && item.components && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#6B7268" }}>Components</div>
                        {item.components.map((c, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span style={{ color: "#1A1F1B" }}>{c.name} <span className="text-xs capitalize" style={{ color: "#6B7268" }}>({c.role.replace("_", " ")})</span></span>
                            <span style={{ color: "#6B7268" }}>{c.kcal} kcal · {c.protein_g}g P</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.why_this_plate && (
                      <div className="mt-3 text-xs p-3 rounded-lg" style={{ backgroundColor: "#FAF8F3", color: "#6B7268" }}>
                        💡 {item.why_this_plate}
                      </div>
                    )}
                    {isComposed && (
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        {[
                          { label: "Protein", value: item.plate_totals?.protein_g ?? 0, color: "#E89B7C" },
                          { label: "Carbs", value: item.plate_totals?.carbs_g ?? 0, color: "#D4A574" },
                          { label: "Fat", value: item.plate_totals?.fat_g ?? 0, color: "#7BA088" },
                        ].map((m) => (
                          <div key={m.label} className="rounded-lg p-2" style={{ backgroundColor: "#FAF8F3" }}>
                            <div className="font-bold" style={{ color: m.color }}>{m.value}g</div>
                            <div style={{ color: "#6B7268" }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 text-center py-16">
          <div className="text-4xl mb-4">📅</div>
          <p className="mb-2 font-semibold" style={{ color: "#1A1F1B" }}>No plan generated yet</p>
          <p className="text-sm" style={{ color: "#6B7268" }}>Open Telegram and send /plan to get your week&apos;s meals.</p>
        </div>
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <PlanContent />
    </Suspense>
  );
}

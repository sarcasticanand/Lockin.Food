"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface ShoppingItem {
  name: string;
  qty: number;
  unit: string;
  category?: string;
  in_pantry?: boolean;
  checked: boolean;
}

function ShopContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    fetch(`/api/shop?uid=${uid}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [uid]);

  async function generateList() {
    if (!uid) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  function toggleItem(index: number) {
    setItems((prev) =>
      prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item)
    );
  }

  // Group by category
  const grouped = items.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const uncheckedCount = items.filter((i) => !i.checked && !i.in_pantry).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
      <div style={{ color: "#2D4A3E" }}>Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#FAF8F3" }}>
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
            Shopping list
          </h1>
          {uid && <Link href={`/dashboard?uid=${uid}`} className="text-sm" style={{ color: "#2D4A3E" }}>← Dashboard</Link>}
        </div>
        <p className="text-sm" style={{ color: "#6B7268" }}>{uncheckedCount} items to buy</p>
      </div>

      <div className="px-5">
        {items.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#FFFFFF" }}>
            <div className="text-4xl mb-3">🛒</div>
            <p className="font-semibold mb-2" style={{ color: "#1A1F1B" }}>No shopping list yet</p>
            <p className="text-sm mb-5" style={{ color: "#6B7268" }}>Generate one from your current meal plan.</p>
            <button
              onClick={generateList}
              disabled={generating}
              className="px-6 py-3 rounded-xl font-semibold text-white transition-colors"
              style={{ backgroundColor: generating ? "#5A7A6B" : "#2D4A3E" }}
            >
              {generating ? "Generating..." : "Generate from plan →"}
            </button>
          </div>
        ) : (
          <>
            {/* Pantry items (pre-checked / greyed) */}
            {items.some((i) => i.in_pantry) && (
              <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: "rgba(123,160,136,0.1)" }}>
                <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#7BA088" }}>
                  ✓ Already in pantry ({items.filter((i) => i.in_pantry).length} items)
                </div>
                {items.filter((i) => i.in_pantry).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: "#7BA088" }}>
                      <span className="text-white text-xs flex items-center justify-center h-full">✓</span>
                    </div>
                    <span className="text-sm line-through" style={{ color: "#6B7268" }}>{item.name} — {item.qty} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Items to buy, grouped by category */}
            {Object.entries(grouped)
              .filter(([, items]) => items.some((i) => !i.in_pantry))
              .map(([cat, catItems]) => (
                <div key={cat} className="rounded-2xl p-4 mb-3" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
                  <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#5A7A6B" }}>{cat}</div>
                  {catItems.filter((i) => !i.in_pantry).map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleItem(items.indexOf(item))}
                      className="w-full flex items-center gap-3 py-2.5 text-left"
                    >
                      <div
                        className="w-5 h-5 rounded flex-shrink-0 border-2 transition-all flex items-center justify-center"
                        style={{
                          borderColor: item.checked ? "#2D4A3E" : "#D1D5DB",
                          backgroundColor: item.checked ? "#2D4A3E" : "transparent",
                        }}
                      >
                        {item.checked && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: item.checked ? "#6B7268" : "#1A1F1B", textDecoration: item.checked ? "line-through" : "none" }}
                        >
                          {item.name}
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: "#6B7268" }}>{item.qty} {item.unit}</span>
                    </button>
                  ))}
                </div>
              ))}

            <button
              onClick={generateList}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: "#E8E4DC", color: "#6B7268" }}
            >
              {generating ? "Regenerating..." : "↻ Regenerate list"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}

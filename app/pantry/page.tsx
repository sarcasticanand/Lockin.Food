"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  status: "fresh" | "low" | "expired" | "out";
  est_depletion_date?: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  fresh: { bg: "rgba(123,160,136,0.15)", color: "#7BA088", label: "Fresh" },
  low: { bg: "rgba(212,165,116,0.15)", color: "#D4A574", label: "Running low" },
  expired: { bg: "rgba(198,107,92,0.15)", color: "#C66B5C", label: "Expired" },
  out: { bg: "rgba(107,114,104,0.1)", color: "#6B7268", label: "Out" },
};

function PantryContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid");
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "", unit: "g", category: "" });

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    fetch(`/api/pantry?uid=${uid}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [uid]);

  async function addItem() {
    if (!uid || !newItem.name || !newItem.quantity) return;
    setAdding(true);
    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, ...newItem, quantity: parseFloat(newItem.quantity) }),
      });
      const data = await res.json();
      if (data.item) setItems((prev) => [data.item, ...prev]);
      setNewItem({ name: "", quantity: "", unit: "g", category: "" });
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/pantry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, status: status as PantryItem["status"] } : item)
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
      <div style={{ color: "#2D4A3E" }}>Loading...</div>
    </div>
  );

  const grouped = items.reduce<Record<string, PantryItem[]>>((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#FAF8F3" }}>
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Fraunces, Georgia, serif", color: "#1A1F1B" }}>
            Pantry
          </h1>
          {uid && <Link href={`/dashboard?uid=${uid}`} className="text-sm" style={{ color: "#2D4A3E" }}>← Dashboard</Link>}
        </div>
        <p className="text-sm" style={{ color: "#6B7268" }}>{items.filter(i => i.status !== "out").length} items in stock</p>
      </div>

      <div className="px-5 space-y-4">
        {/* Add item */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
          <div className="text-sm font-semibold mb-3" style={{ color: "#1A1F1B" }}>Add item</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
              className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E8E4DC" }}
            />
            <input
              type="number"
              placeholder="Qty"
              value={newItem.quantity}
              onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
              className="w-20 border rounded-xl px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E8E4DC" }}
            />
            <select
              value={newItem.unit}
              onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
              className="border rounded-xl px-2 py-2 text-sm outline-none"
              style={{ borderColor: "#E8E4DC" }}
            >
              {["g", "kg", "ml", "L", "pcs", "cups"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <button
            onClick={addItem}
            disabled={adding || !newItem.name || !newItem.quantity}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: (adding || !newItem.name || !newItem.quantity) ? "#B0BDB8" : "#2D4A3E" }}
          >
            {adding ? "Adding..." : "+ Add to pantry"}
          </button>
        </div>

        {/* Items by category */}
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🧺</div>
            <p className="font-semibold" style={{ color: "#1A1F1B" }}>Pantry is empty</p>
            <p className="text-sm mt-1" style={{ color: "#6B7268" }}>Add items you have at home to personalise your plan.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 8px rgba(45,74,62,0.05)" }}>
              <div className="px-4 pt-4 pb-2">
                <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5A7A6B" }}>{cat}</div>
              </div>
              {catItems.map((item) => {
                const style = STATUS_STYLES[item.status];
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: "#F0EDE6" }}>
                    <div className="flex-1">
                      <div className="font-medium text-sm" style={{ color: "#1A1F1B" }}>{item.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B7268" }}>{item.quantity} {item.unit}</div>
                    </div>
                    <select
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className="text-xs font-medium px-2 py-1 rounded-lg border-0 outline-none"
                      style={{ backgroundColor: style.bg, color: style.color }}
                    >
                      <option value="fresh">Fresh</option>
                      <option value="low">Running low</option>
                      <option value="expired">Expired</option>
                      <option value="out">Out</option>
                    </select>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PantryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF8F3" }}>
        <div style={{ color: "#2D4A3E" }}>Loading...</div>
      </div>
    }>
      <PantryContent />
    </Suspense>
  );
}

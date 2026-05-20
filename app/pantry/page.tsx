'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import type { PantryItem, PantryStatus } from '@/types'
import BottomNav from '@/components/BottomNav'

const STATUS_COLORS: Record<PantryStatus, string> = {
  fresh: '#7BA088', low: '#D4A574', expired: '#C66B5C', out: '#6B7268',
}

function PantryContent() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'g', category: '' })

  const load = () => {
    if (!uid) return
    fetch(`/api/pantry?uid=${uid}`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [uid])

  const addItem = async () => {
    if (!uid || !form.name) return
    await fetch('/api/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, name: form.name, quantity: Number(form.quantity) || null, unit: form.unit, category: form.category || null }),
    })
    setForm({ name: '', quantity: '', unit: 'g', category: '' })
    setAdding(false)
    load()
  }

  const updateStatus = async (id: string, status: PantryStatus) => {
    await fetch('/api/pantry', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  const deleteItem = async (id: string) => {
    await fetch('/api/pantry', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))]

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href={`/dashboard?uid=${uid}`} className="text-[#6B7268] hover:text-ink"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-display font-semibold text-lg text-ink flex-1">Pantry</h1>
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-safe">
        {adding && (
          <div className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4 mb-5 space-y-3">
            <h3 className="font-medium text-ink">Add item</h3>
            <Input placeholder="Item name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="flex gap-2">
              <Input placeholder="Quantity" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="flex-1" />
              <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['g', 'kg', 'ml', 'L', 'pcs', 'dozen'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Category (optional)" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            <div className="flex gap-2">
              <Button onClick={addItem} disabled={!form.name} className="flex-1">Add item</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#6B7268] mb-3">Your pantry is empty.</p>
            <Button onClick={() => setAdding(true)} variant="outline">Add your first item</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {(categories.length > 0 ? categories : [null]).map(cat => {
              const catItems = cat ? items.filter(i => i.category === cat) : items.filter(i => !i.category)
              if (catItems.length === 0) return null
              return (
                <div key={cat || 'other'}>
                  {cat && <h3 className="text-xs font-medium text-[#6B7268] uppercase tracking-wider mb-2 mt-4">{cat}</h3>}
                  <div className="space-y-2">
                    {catItems.map(item => (
                      <div key={item.id} className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[item.status] }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-ink">{item.name}</div>
                          {item.quantity && <div className="text-xs text-[#6B7268]">{item.quantity} {item.unit}</div>}
                        </div>
                        <Select value={item.status} onValueChange={v => updateStatus(item.id, v as PantryStatus)}>
                          <SelectTrigger className="w-24 h-8 text-xs border-0 bg-[#F5F3EE]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['fresh', 'low', 'expired', 'out'] as PantryStatus[]).map(s => (
                              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button onClick={() => deleteItem(item.id)} className="text-[#6B7268] hover:text-[#C66B5C] transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav uid={uid} />
    </div>
  )
}

export default function PantryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>}>
      <PantryContent />
    </Suspense>
  )
}

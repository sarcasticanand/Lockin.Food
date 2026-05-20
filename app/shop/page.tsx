'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, RefreshCw } from 'lucide-react'

interface ShopItem {
  name: string
  qty: number
  unit: string
  category?: string
  checked: boolean
  in_pantry?: boolean
}

function ShopContent() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const [items, setItems] = useState<ShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!uid) return
    fetch(`/api/shop?uid=${uid}`)
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .finally(() => setLoading(false))
  }, [uid])

  const generate = async () => {
    if (!uid) return
    setGenerating(true)
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid }),
    })
    const data = await res.json()
    setItems(data.items || [])
    setGenerating(false)
  }

  const toggle = (name: string) => {
    setItems(prev => prev.map(i => i.name === name ? { ...i, checked: !i.checked } : i))
  }

  const categories = [...new Set(items.map(i => i.category || 'Other'))]
  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  return (
    <div className="min-h-screen bg-cream">
      <nav className="sticky top-0 bg-cream/95 backdrop-blur border-b border-[#E8E4DC] z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <Link href={`/dashboard?uid=${uid}`} className="text-[#6B7268] hover:text-ink"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-display font-semibold text-lg text-ink flex-1">Shopping List</h1>
          <Button size="sm" onClick={generate} disabled={generating} variant="outline" className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Regenerate'}
          </Button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#6B7268] mb-4">No shopping list yet.</p>
            <Button onClick={generate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate from meal plan'}
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[#6B7268] mb-5">{unchecked.length} items to buy · {checked.length} already have</p>
            {categories.map(cat => {
              const catItems = items.filter(i => (i.category || 'Other') === cat)
              if (catItems.length === 0) return null
              return (
                <div key={cat} className="mb-5">
                  <h3 className="text-xs font-medium text-[#6B7268] uppercase tracking-wider mb-2">{cat}</h3>
                  <div className="bg-white rounded-[16px] shadow-[0_2px_16px_rgba(0,0,0,0.06)] divide-y divide-[#F0EDE6]">
                    {catItems.map(item => (
                      <label key={item.name} className="flex items-center gap-3 p-3.5 cursor-pointer">
                        <Checkbox checked={item.checked} onCheckedChange={() => toggle(item.name)} />
                        <span className={`flex-1 text-sm ${item.checked ? 'line-through text-[#6B7268]' : 'text-ink'}`}>
                          {item.name}
                        </span>
                        <span className="text-xs text-[#6B7268] shrink-0">{item.qty} {item.unit}</span>
                        {item.in_pantry && <span className="text-xs text-[#7BA088] shrink-0">in pantry</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#2D4A3E] border-t-transparent rounded-full animate-spin" /></div>}>
      <ShopContent />
    </Suspense>
  )
}

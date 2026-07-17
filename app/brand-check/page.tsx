'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Camera, Check, ChevronRight, CircleAlert, Clock3, ExternalLink,
  Globe2, LoaderCircle, MessageCircleMore, Search, ShieldAlert, ShieldCheck,
  ShieldQuestion, Sparkles, Tag, X,
} from 'lucide-react'

type Source = { title: string; url: string; type: 'Website' | 'Reddit' | 'Instagram' | 'Other' }
type Report = {
  brandName: string; risk: 'low' | 'moderate' | 'high' | 'unknown'; confidence: string; score: number;
  verdict: string; summary: string;
  history: { date: string; event: string; kind: string }[];
  complaints: { topic: string; count: string; detail: string; sentiment: string }[];
  signals: { label: string; detail: string; tone: 'good' | 'warning' | 'neutral' }[];
  coverage: Record<'website' | 'reddit' | 'instagram' | 'tagged', 'checked' | 'limited' | 'not found'>;
  limitations: string[]; nextSteps: string[]; sourceNotes: string[]; sources: Source[];
}

const example: Report = {
  brandName: 'No data yet', risk: 'unknown', confidence: '—', score: 0,
  verdict: '', summary: '', history: [], complaints: [], signals: [],
  coverage: { website: 'not found', reddit: 'not found', instagram: 'not found', tagged: 'not found' },
  limitations: [], nextSteps: [], sourceNotes: [], sources: [],
}

function riskStyle(risk: Report['risk']) {
  return risk === 'low'
    ? { label: 'Lower risk', icon: ShieldCheck, color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-100', bar: 'bg-emerald-500' }
    : risk === 'high'
      ? { label: 'High risk', icon: ShieldAlert, color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-100', bar: 'bg-rose-500' }
      : risk === 'moderate'
        ? { label: 'Use caution', icon: CircleAlert, color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-100', bar: 'bg-amber-500' }
        : { label: 'Needs research', icon: ShieldQuestion, color: 'text-slate-600', bg: 'bg-slate-50', ring: 'ring-slate-100', bar: 'bg-slate-400' }
}

function CoverageMark({ value }: { value: Report['coverage']['website'] }) {
  if (value === 'checked') return <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" /> Checked</span>
  if (value === 'limited') return <span className="inline-flex items-center gap-1 text-amber-700"><CircleAlert className="h-3.5 w-3.5" /> Limited</span>
  return <span className="text-slate-400">Not found</span>
}

export default function BrandCheckPage() {
  const [brand, setBrand] = useState('')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function research(event: FormEvent) {
    event.preventDefault()
    if (!brand.trim() && !website.trim() && !instagram.trim()) return
    setLoading(true); setError(''); setReport(null)
    try {
      const res = await fetch('/api/brand-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, website, instagram }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to research this business.')
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to research this business.')
    } finally { setLoading(false) }
  }

  const current = report ?? example
  const style = riskStyle(current.risk)
  const RiskIcon = style.icon
  const isEmpty = !report

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#19231c] selection:bg-[#d4edc8]">
      <header className="border-b border-[#e5e9e2] bg-[#f7f8f5]/90 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-5 h-[68px] flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-[-0.02em]">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-[#1f623e] text-white shadow-sm"><ShieldCheck className="w-5 h-5" /></span>
            <span className="text-lg">Verity</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm text-[#627066]">
            <span>Independent brand checks</span><span className="w-px h-4 bg-[#d9dfd7]" /><span className="text-[#1f623e] font-medium">Public evidence only</span>
          </div>
          <Link href="/" className="text-sm font-medium text-[#4b5e51] hover:text-[#1f623e] inline-flex gap-1.5 items-center"><ArrowLeft className="w-4 h-4" /> Back</Link>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-5 pt-12 pb-8 lg:pt-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#4b7c59] mb-5"><Sparkles className="w-3.5 h-3.5" /> AI-assisted due diligence</div>
          <h1 className="text-[clamp(2.25rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.055em] font-semibold text-[#172219]">Know who you&apos;re buying from.</h1>
          <p className="text-lg leading-relaxed text-[#627066] mt-6 max-w-xl">Check the public footprint behind an Instagram business before you pay. Verity connects the dots across its site, Reddit, posts, comments, and tagged content.</p>
        </div>

        <form onSubmit={research} className="mt-9 rounded-3xl bg-white border border-[#e1e6df] shadow-[0_18px_55px_-35px_rgba(24,61,39,.45)] p-3 sm:p-4 max-w-5xl">
          <div className="grid md:grid-cols-[1.1fr_1fr_1fr_auto] gap-2">
            <label className="relative flex items-center h-13 rounded-2xl bg-[#f7f8f5] px-3.5 focus-within:ring-2 focus-within:ring-[#9bcfa5]">
              <Search className="w-4 h-4 text-[#79907e] shrink-0" /><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand name" className="w-full bg-transparent outline-none px-2.5 text-sm placeholder:text-[#94a197]" />
            </label>
            <label className="relative flex items-center h-13 rounded-2xl bg-[#f7f8f5] px-3.5 focus-within:ring-2 focus-within:ring-[#9bcfa5]">
              <Globe2 className="w-4 h-4 text-[#79907e] shrink-0" /><input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website (optional)" className="w-full bg-transparent outline-none px-2.5 text-sm placeholder:text-[#94a197]" />
            </label>
            <label className="relative flex items-center h-13 rounded-2xl bg-[#f7f8f5] px-3.5 focus-within:ring-2 focus-within:ring-[#9bcfa5]">
              <Camera className="w-4 h-4 text-[#79907e] shrink-0" /><input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@instagram (optional)" className="w-full bg-transparent outline-none px-2.5 text-sm placeholder:text-[#94a197]" />
            </label>
            <button disabled={loading || (!brand.trim() && !website.trim() && !instagram.trim())} className="h-13 rounded-2xl px-5 bg-[#1f623e] text-white text-sm font-semibold inline-flex justify-center items-center gap-2 hover:bg-[#185233] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Researching</> : <>Run check <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
          <p className="text-[11px] text-[#849088] mt-3 px-1">Results are a risk signal, not a legal finding. Social platforms may restrict access to comments and tagged posts.</p>
        </form>
        {error && <div className="max-w-5xl mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex gap-2 text-sm text-rose-800"><X className="w-4 h-4 mt-0.5" />{error}</div>}
      </section>

      {!isEmpty && <section className="max-w-7xl mx-auto px-5 pb-16 animate-in fade-in duration-500">
        <div className="grid xl:grid-cols-[1.3fr_.7fr] gap-5">
          <div className="rounded-3xl bg-[#183d27] text-white p-6 sm:p-8 overflow-hidden relative">
            <div className="absolute right-[-60px] top-[-80px] w-64 h-64 rounded-full border-[28px] border-[#5c9b6d]/20" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4"><span className="text-xs uppercase tracking-[.13em] font-semibold text-[#b5d8ba]">Brand report</span><span className="text-xs text-white/55">Confidence: {current.confidence}</span></div>
              <div className="mt-7 flex flex-wrap gap-6 items-end">
                <div className="w-[130px] h-[130px] rounded-full border-[9px] border-white/10 grid place-items-center relative">
                  <div className={`absolute inset-[-9px] rounded-full border-[9px] border-transparent ${current.risk === 'high' ? 'border-t-rose-400 border-r-rose-400' : current.risk === 'moderate' ? 'border-t-amber-400 border-r-amber-400 border-b-amber-400' : 'border-emerald-400'}`} />
                  <div className="text-center"><div className="text-4xl font-semibold tracking-tight">{current.score}</div><div className="text-[10px] uppercase tracking-wider text-white/50 mt-1">risk score</div></div>
                </div>
                <div className="pb-1 flex-1 min-w-[180px]"><div className="text-3xl font-semibold tracking-[-.04em]">{current.brandName}</div><div className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${style.bg} ${style.color}`}><RiskIcon className="w-4 h-4 mr-1.5" /> {style.label}</div></div>
              </div>
              <p className="mt-7 text-lg leading-relaxed text-white/85 max-w-2xl">{current.verdict}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/55 max-w-2xl">{current.summary}</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-[#e1e6df] p-6 sm:p-7">
            <div className="flex gap-2 items-center text-sm font-semibold"><Search className="w-4 h-4 text-[#1f623e]" /> Where we looked</div>
            <div className="mt-5 grid grid-cols-2 gap-y-5 text-xs">
              <div><div className="flex gap-2 items-center mb-1.5 text-[#607166]"><Globe2 className="w-4 h-4" /> Website</div><CoverageMark value={current.coverage.website} /></div>
              <div><div className="flex gap-2 items-center mb-1.5 text-[#607166]"><MessageCircleMore className="w-4 h-4" /> Reddit</div><CoverageMark value={current.coverage.reddit} /></div>
              <div><div className="flex gap-2 items-center mb-1.5 text-[#607166]"><Camera className="w-4 h-4" /> Posts + comments</div><CoverageMark value={current.coverage.instagram} /></div>
              <div><div className="flex gap-2 items-center mb-1.5 text-[#607166]"><Tag className="w-4 h-4" /> Tagged content</div><CoverageMark value={current.coverage.tagged} /></div>
            </div>
            <div className="mt-6 pt-5 border-t border-[#e6ebe5] text-xs text-[#728076] leading-relaxed">This score weighs public evidence quality, policy clarity, and recurring customer reports. It does not prove a business is legitimate or fraudulent.</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-5 mt-5">
          <div className="rounded-3xl border border-[#e1e6df] bg-white p-6 sm:p-7">
            <div className="flex items-center justify-between"><h2 className="font-semibold text-lg tracking-[-.025em]">Most common complaints</h2><span className="text-xs text-[#7d8b80]">Grouped from public reports</span></div>
            <div className="mt-5 divide-y divide-[#e8ece7]">
              {current.complaints.map((item) => <div key={item.topic} className="py-4 first:pt-0"><div className="flex gap-3 justify-between items-start"><h3 className="font-medium text-sm">{item.topic}</h3><span className="shrink-0 text-[11px] rounded-full bg-rose-50 text-rose-700 px-2 py-1">{item.count}</span></div><p className="mt-2 text-sm leading-relaxed text-[#66756a]">{item.detail}</p></div>)}
            </div>
          </div>
          <div className="rounded-3xl border border-[#e1e6df] bg-white p-6 sm:p-7"><h2 className="font-semibold text-lg tracking-[-.025em]">Signals at a glance</h2><div className="mt-5 space-y-4">{current.signals.map(signal => <div key={signal.label} className="flex gap-3"><span className={`mt-0.5 grid place-items-center h-5 w-5 rounded-full ${signal.tone === 'good' ? 'bg-emerald-100 text-emerald-700' : signal.tone === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{signal.tone === 'good' ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}</span><div><div className="text-sm font-medium">{signal.label}</div><p className="mt-0.5 text-xs leading-relaxed text-[#738075]">{signal.detail}</p></div></div>)}</div></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5 mt-5">
          <div className="rounded-3xl border border-[#e1e6df] bg-white p-6 sm:p-7"><h2 className="font-semibold text-lg tracking-[-.025em] flex gap-2 items-center"><Clock3 className="w-4 h-4 text-[#4b7c59]" /> Brief history</h2><div className="mt-6 relative pl-5 before:absolute before:left-[4px] before:top-2 before:bottom-2 before:w-px before:bg-[#d8e2d9] space-y-5">{current.history.map(item => <div key={`${item.date}-${item.event}`} className="relative"><span className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#4b9660] ring-4 ring-[#e8f3ea]" /><div className="text-xs font-medium text-[#4b7c59]">{item.date}</div><p className="text-sm text-[#4d5e52] mt-1">{item.event}</p></div>)}</div></div>
          <div className="rounded-3xl bg-[#edf4ed] p-6 sm:p-7"><h2 className="font-semibold text-lg tracking-[-.025em]">Before you buy</h2><div className="mt-5 space-y-3">{current.nextSteps.map(step => <div className="text-sm leading-relaxed text-[#4f6654] flex gap-2.5" key={step}><span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#377a4a] shrink-0" />{step}</div>)}</div><div className="mt-6 border-t border-[#cfe0d0] pt-5"><div className="text-xs font-semibold uppercase tracking-[.12em] text-[#5d7562]">Research limits</div><ul className="mt-2 space-y-1.5">{current.limitations.map(item => <li className="text-xs leading-relaxed text-[#65796a]" key={item}>• {item}</li>)}</ul></div></div>
        </div>

        <div className="rounded-3xl border border-[#e1e6df] bg-white p-6 sm:p-7 mt-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-lg tracking-[-.025em]">Evidence & sources</h2><p className="text-xs text-[#77857b] mt-1">Open a source and form your own view.</p></div><span className="text-xs text-[#7b897e]">{current.sources.length} sources</span></div><div className="mt-5 grid md:grid-cols-2 xl:grid-cols-3 gap-3">{current.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="group rounded-xl border border-[#e4e9e3] p-3.5 hover:border-[#a9c7ae] hover:bg-[#f7fbf7] transition-colors"><div className="flex items-start gap-2"><span className="text-[10px] uppercase tracking-wider font-semibold text-[#4b7c59]">{source.type}</span><ExternalLink className="ml-auto w-3.5 h-3.5 text-[#91a096] group-hover:text-[#337548]" /></div><p className="mt-2 text-sm leading-snug font-medium line-clamp-2 text-[#3b4d40]">{source.title}</p><p className="mt-1 text-[11px] text-[#87948a] truncate">{source.url.replace(/^https?:\/\//, '')}</p></a>)}</div></div>
      </section>}

      {isEmpty && <section className="max-w-7xl mx-auto px-5 pb-20 pt-8"><div className="grid md:grid-cols-3 gap-4 max-w-4xl"><div className="rounded-2xl border border-[#e1e6df] bg-white p-5"><Globe2 className="w-5 h-5 text-[#39794b]" /><h2 className="mt-4 font-medium">Official footprint</h2><p className="mt-1.5 text-sm leading-relaxed text-[#748177]">Policies, contact details, business records, and website consistency.</p></div><div className="rounded-2xl border border-[#e1e6df] bg-white p-5"><MessageCircleMore className="w-5 h-5 text-[#39794b]" /><h2 className="mt-4 font-medium">Unfiltered reports</h2><p className="mt-1.5 text-sm leading-relaxed text-[#748177]">Reddit conversations and third-party reports, grouped into recurring themes.</p></div><div className="rounded-2xl border border-[#e1e6df] bg-white p-5"><Camera className="w-5 h-5 text-[#39794b]" /><h2 className="mt-4 font-medium">Social proof, scrutinised</h2><p className="mt-1.5 text-sm leading-relaxed text-[#748177]">Publicly accessible posts, comments, and tagged content—clearly marked when access is limited.</p></div></div></section>}
    </main>
  )
}

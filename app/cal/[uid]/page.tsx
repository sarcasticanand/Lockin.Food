'use client'

import { useEffect, useState, use } from 'react'

// One-tap add-to-calendar page. Linked from the bot's welcome message so
// users never copy-paste a feed URL: Apple Calendar subscribes via webcal://,
// Google via its add-by-URL deep link. The subscription then auto-refreshes.

export default function AddToCalendarPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params)
  const [host, setHost] = useState('')
  const [copied, setCopied] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setHost(window.location.host)
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent))
  }, [])

  const feedUrl = `https://${host}/api/calendar/${uid}`
  const webcalUrl = `webcal://${host}/api/calendar/${uid}`
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`

  const appleButton = (
    <a href={webcalUrl}
      className="block w-full text-center py-4 rounded-2xl bg-[#2D4A3E] text-white font-semibold text-base shadow-lg active:scale-[0.98] transition-transform">
       Add to Apple Calendar
    </a>
  )
  const googleButton = (
    <a href={googleUrl} target="_blank" rel="noopener noreferrer"
      className="block w-full text-center py-4 rounded-2xl bg-white border-2 border-[#2D4A3E] text-[#2D4A3E] font-semibold text-base shadow active:scale-[0.98] transition-transform">
      Add to Google Calendar
    </a>
  )

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center py-12">
        <div className="text-5xl mb-4">🗓</div>
        <h1 className="font-display text-2xl font-bold text-ink mb-2">Your meals, in your calendar</h1>
        <p className="text-[#6B7268] text-sm mb-8 leading-relaxed">
          Today&apos;s and tomorrow&apos;s meals with reminders — always up to date, even when your plan changes. One tap:
        </p>

        <div className="space-y-3 mb-8">
          {host && (isIOS ? <>{appleButton}{googleButton}</> : <>{googleButton}{appleButton}</>)}
        </div>

        <details className="text-left">
          <summary className="text-xs text-[#6B7268] cursor-pointer">Buttons not working? Add manually</summary>
          <div className="mt-3 bg-white rounded-xl p-3 shadow">
            <p className="text-xs text-[#6B7268] mb-2">Copy this URL into your calendar app under &ldquo;Add calendar → From URL / Subscribe&rdquo;:</p>
            <button
              onClick={() => { navigator.clipboard.writeText(feedUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="w-full text-left text-xs font-mono bg-[#F5F3EE] rounded-lg p-2.5 break-all text-ink">
              {copied ? '✅ Copied!' : feedUrl}
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}

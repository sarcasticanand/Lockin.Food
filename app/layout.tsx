import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Lockin — Your AI Nutrition Coach',
  description: 'AI-powered meal plans, macro tracking, and daily Telegram check-ins. India-first.',
  keywords: ['nutrition', 'meal planning', 'macros', 'AI coach', 'Telegram', 'India'],
  openGraph: {
    title: 'Lockin — Your AI Nutrition Coach',
    description: 'AI-powered meal planning, macro tracking, and grocery intelligence on Telegram.',
    url: 'https://lockin.food',
    siteName: 'Lockin',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full bg-cream text-ink antialiased">{children}</body>
    </html>
  )
}

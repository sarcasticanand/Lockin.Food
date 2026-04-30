import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lockin — Your AI Nutrition Coach",
  description:
    "Lockin plans your meals, tracks your macros, and orders your groceries. AI nutrition coaching on Telegram.",
  keywords: ["nutrition", "meal planning", "macros", "AI coach", "Telegram", "India"],
  openGraph: {
    title: "Lockin — Your AI Nutrition Coach",
    description:
      "AI-powered meal planning, macro tracking, and grocery ordering on Telegram.",
    url: "https://lockin.food",
    siteName: "Lockin",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}

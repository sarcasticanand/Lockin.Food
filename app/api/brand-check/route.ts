import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 90

type Source = { title: string; url: string; type: 'Website' | 'Reddit' | 'Instagram' | 'Other' }

function extractJson(text: string) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('The research response was not in the expected format.')
  return JSON.parse(match[0])
}

function sourceType(url: string): Source['type'] {
  try {
    const host = new URL(url).hostname
    if (host.includes('reddit.com')) return 'Reddit'
    if (host.includes('instagram.com')) return 'Instagram'
    return 'Other'
  } catch {
    return 'Other'
  }
}

export async function POST(request: NextRequest) {
  try {
    const { brand, website, instagram } = await request.json()
    const subject = [brand?.trim(), website?.trim(), instagram?.trim()].filter(Boolean).join(' | ')

    if (!subject) {
      return NextResponse.json({ error: 'Add a brand name, website, or Instagram handle.' }, { status: 400 })
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Set GEMINI_API_KEY to run live brand research.' }, { status: 503 })
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const prompt = `You are a careful consumer-protection research assistant. Research this business: ${subject}.

Search the public web, prioritizing: its official website and policies, Reddit discussions, public Instagram posts/comments/tagged content that are indexed or otherwise publicly accessible, reputable review sites, and business registries/news. Do not claim to have viewed private, login-gated, deleted, or unindexed social content. Do not treat absence of evidence as proof of safety or fraud. Distinguish allegations from verified facts. Never make a definitive legal accusation; give a risk assessment based on observed evidence.

Return ONLY valid JSON with this exact shape:
{
  "brandName": "string",
  "risk": "low|moderate|high|unknown",
  "confidence": "low|medium|high",
  "score": 0,
  "verdict": "one sentence, cautious and plain-language",
  "summary": "2-3 concise sentences on what the brand is and the evidence picture",
  "history": [{"date":"YYYY or YYYY-MM or Unknown","event":"short factual event","kind":"launch|policy|review|social|other"}],
  "complaints": [{"topic":"short topic","count":"isolated|some reports|recurring","detail":"concise, attribution-aware explanation","sentiment":"negative|mixed"}],
  "signals": [{"label":"short label","detail":"concise evidence-based explanation","tone":"good|warning|neutral"}],
  "coverage": {"website":"checked|limited|not found","reddit":"checked|limited|not found","instagram":"checked|limited|not found","tagged":"checked|limited|not found"},
  "limitations": ["specific limitation or uncertainty"],
  "nextSteps": ["practical action the shopper can take"],
  "sourceNotes": ["brief note on what sources support the assessment"]
}

Keep the history to 4 items max, complaints to 4, signals to 5, limitations to 3, and nextSteps to 3. Include only claims you can support from sources you find.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const data = extractJson(response.text ?? '')
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
    const seen = new Set<string>()
    const sources: Source[] = chunks
      .flatMap(chunk => chunk.web?.uri ? [{
        title: chunk.web.title || new URL(chunk.web.uri).hostname,
        url: chunk.web.uri,
        type: sourceType(chunk.web.uri),
      }] : [])
      .filter(source => !seen.has(source.url) && !!seen.add(source.url))
      .slice(0, 12)

    const officialUrl = typeof website === 'string' && website.trim()
      ? website.trim().startsWith('http') ? website.trim() : `https://${website.trim()}`
      : undefined
    if (officialUrl && !sources.some(source => source.url.includes(officialUrl.replace(/^https?:\/\//, '').split('/')[0]))) {
      sources.unshift({ title: 'Brand website', url: officialUrl, type: 'Website' })
    }

    return NextResponse.json({ ...data, sources })
  } catch (error) {
    console.error('[brand-check]', error)
    const message = error instanceof Error ? error.message : 'Research could not be completed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

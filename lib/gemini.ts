import { GoogleGenAI } from '@google/genai'

let _ai: GoogleGenAI | null = null

function ai() {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return _ai
}

export async function generatePlanContent(prompt: string): Promise<string> {
  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash-8b']
  let lastError: Error = new Error('All models failed')

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai().models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        })
        return response.text ?? ''
      } catch (err) {
        lastError = err as Error
        const msg = lastError.message || ''
        if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000))
          continue
        }
        break // non-retriable error, try next model
      }
    }
  }
  throw lastError
}

export async function generateChatContent(systemInstruction: string, userMessage: string): Promise<string> {
  const response = await ai().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userMessage,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })
  return response.text ?? ''
}

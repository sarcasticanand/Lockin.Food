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
  const response = await ai().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  })
  return response.text ?? ''
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

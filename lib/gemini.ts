import { GoogleGenerativeAI } from '@google/generative-ai'

let _ai: GoogleGenerativeAI | null = null

function ai() {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
    _ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }
  return _ai
}

export function getChatModel(systemInstruction?: string) {
  return ai().getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
  })
}

export function getPlanModel() {
  return ai().getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  })
}

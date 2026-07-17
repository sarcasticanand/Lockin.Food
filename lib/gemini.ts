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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MealPhotoEstimate {
  dish: string
  portion: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  matches_planned: boolean
  confidence: 'high' | 'medium' | 'low'
  comment: string
}

// Analyse a meal photo against what the user was supposed to eat. Because we
// pass the planned meal, this is mostly a verification task ("is this the
// rajma chawal on the plan, and roughly how much?") rather than open-world
// food recognition — which is what keeps accuracy usable.
export async function analyzeMealPhoto(
  imageBase64: string,
  mimeType: string,
  context: { plannedMeal?: string; plannedKcal?: number; slotLabel?: string }
): Promise<MealPhotoEstimate> {
  const plannedLine = context.plannedMeal
    ? `Their meal plan says they should be eating: "${context.plannedMeal}" (~${context.plannedKcal || '?'} kcal) for ${context.slotLabel || 'this meal'}.`
    : 'No specific meal was planned for this time.'

  const prompt = `You are a nutritionist analysing a photo of an Indian meal.
${plannedLine}

Look at the photo and estimate what the dish is and its nutrition. If it clearly matches the planned meal, say so and use portions visible in the photo to refine the calorie estimate.

Return ONLY JSON:
{
  "dish": "specific dish name with visible portions, e.g. '2 rotis with palak paneer and salad'",
  "portion": "brief portion description",
  "kcal": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "matches_planned": true/false,
  "confidence": "high" | "medium" | "low",
  "comment": "one short encouraging or corrective sentence for the user"
}`

  const response = await ai().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: prompt },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const text = (response.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(text) as MealPhotoEstimate
  return {
    dish: String(parsed.dish || 'Unknown dish'),
    portion: String(parsed.portion || ''),
    kcal: Number(parsed.kcal) || 0,
    protein_g: Number(parsed.protein_g) || 0,
    carbs_g: Number(parsed.carbs_g) || 0,
    fat_g: Number(parsed.fat_g) || 0,
    matches_planned: Boolean(parsed.matches_planned),
    confidence: (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium') as MealPhotoEstimate['confidence'],
    comment: String(parsed.comment || ''),
  }
}

export async function generateChatWithHistory(
  systemInstruction: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string> {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  const response = await ai().models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })
  return response.text ?? ''
}

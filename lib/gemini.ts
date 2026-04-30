import { GoogleGenerativeAI } from '@google/generative-ai';

let genAIInstance: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI {
  if (!genAIInstance) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    genAIInstance = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAIInstance;
}

// Chat model — for Telegram conversations
export function getChatModel(systemInstruction?: string) {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
  });
}

// JSON generation model — for meal plan generation (deterministic output)
export function getPlanModel() {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
    },
  });
}

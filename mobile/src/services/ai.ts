export type AssistantKind = 'emergency' | 'mental'
export type ChatLanguage = 'en' | 'my'

export interface ChatResult {
  response: string
  category: string
  timestamp: string
  model?: string
  online?: boolean
}

export interface PinSuggestionItem {
  name: string
  qty: number
}

export interface PinSuggestion {
  isValid: boolean
  reason: string
  severity: number
  categories: string[]
  items: PinSuggestionItem[]
  confidence: number
}

function resolveBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')
}

import { askLocalLlama, checkModelExists } from './offlineAi';

function getSystemPrompt(assistant: AssistantKind): string {
  if (assistant === 'emergency') {
    return "You are Rescura Emergency AI. Provide short, concise, and safe first-aid and survival instructions. Do not hallucinate medical advice.";
  }
  return "You are Rescura Mental Health AI. Provide calming, supportive, and extremely brief empathetic responses.";
}

export async function askAssistant(message: string, language: ChatLanguage, assistant: AssistantKind = 'emergency'): Promise<ChatResult> {
  const baseUrl = resolveBaseUrl()
  
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, language, assistant }),
      })

      const json = await response.json().catch(() => null)
      if (response.ok) {
        return json as ChatResult
      }
      // If response is not ok, we might still want to fallback if it's a 502/server down issue, 
      // but let's throw to be caught by the fallback wrapper.
      throw new Error(json?.message || json?.error || 'Failed to get AI response')
    } catch (error) {
      console.log("Online AI failed, attempting offline fallback...", error);
    }
  }

  // Offline Fallback
  const isModelReady = await checkModelExists();
  if (!isModelReady) {
    throw new Error('You are offline and the Offline AI model is not downloaded. Please connect to the internet.');
  }

  const prompt = getSystemPrompt(assistant);
  const localResponse = await askLocalLlama(message, prompt);
  
  return {
    response: localResponse,
    category: assistant,
    timestamp: new Date().toISOString(),
    model: 'local-qwen-0.5b',
    online: false
  };
}

export async function analyzePin(params: {
  description: string
  allowedItems?: string[]
  imageBase64?: string
  imageMime?: string
  location?: { lat: number; lng: number }
}): Promise<PinSuggestion> {
  const baseUrl = resolveBaseUrl()
  
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/ai/analyze-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: params.description,
          allowedItems: params.allowedItems || [],
          imageBase64: params.imageBase64,
          imageMime: params.imageMime,
          location: params.location,
        }),
      })

      const json = await response.json().catch(() => null)
      if (response.ok && json?.suggestion) {
        return json.suggestion as PinSuggestion
      }
      throw new Error(json?.message || json?.error || 'Failed to analyze pin')
    } catch (error) {
      console.log("Online Pin Analysis failed, attempting offline fallback...", error);
    }
  }

  // Offline Fallback for Pin Analysis
  const isModelReady = await checkModelExists();
  if (!isModelReady) {
    throw new Error('You are offline and the Offline AI model is not downloaded. Please connect to the internet.');
  }

  // We construct a highly restrictive prompt to force JSON output without giving a literal mock to parrot.
  const systemPrompt = `You are a disaster relief AI. Analyze the user's report and extract severity, categories, and needed items.
Respond ONLY with a valid JSON object matching this exact TypeScript interface, nothing else:
{
  "severity": number (1-10),
  "categories": string[] (e.g. 'fire', 'medical', 'flood'),
  "items": { "name": string, "qty": number }[]
}`;

  const localResponse = await askLocalLlama(params.description, systemPrompt);
  
  // Extract JSON from response (in case the model adds some text)
  let suggestionObj: any = null;
  try {
    const jsonMatch = localResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      suggestionObj = JSON.parse(jsonMatch[0]);
    }
    
    if (!suggestionObj || typeof suggestionObj.severity !== 'number') {
      throw new Error("Invalid format returned by AI");
    }
  } catch (e) {
    console.error("Failed to parse local AI JSON response:", localResponse);
    throw new Error('Local AI failed to generate valid analysis format');
  }

  return {
    isValid: true,
    reason: "Analyzed locally (Offline Mode)",
    severity: suggestionObj.severity,
    categories: suggestionObj.categories || [],
    items: suggestionObj.items || [],
    confidence: 0.8,
  };
}
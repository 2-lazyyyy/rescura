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

export async function askAssistant(message: string, language: ChatLanguage, assistant: AssistantKind = 'emergency') {
  const baseUrl = resolveBaseUrl()
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured')
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, language, assistant }),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(json?.message || json?.error || 'Failed to get AI response')
  }

  return json as ChatResult
}

export async function analyzePin(params: {
  description: string
  allowedItems?: string[]
  imageBase64?: string
  imageMime?: string
  location?: { lat: number; lng: number }
}) {
  const baseUrl = resolveBaseUrl()
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured')
  }

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
  if (!response.ok || !json?.suggestion) {
    throw new Error(json?.message || json?.error || 'Failed to analyze pin')
  }

  return json.suggestion as PinSuggestion
}
// src/lib/chat.ts
export type ChatCategory = 'safety'|'location'|'medical'|'emergency'|'mental'|'general'
export type AssistantKind = 'emergency'|'mental'

export interface ChatResult {
  response: string
  category: ChatCategory
  timestamp: string
  model?: string
  online?: boolean
  error?: boolean
  dataset_refs?: Array<{ id: number; rank: number; score: number; label: string }>
}

type ChatFilePayload = { name: string; type: string; dataUrl: string }

const REQUEST_TIMEOUT_MS = 60_000

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('file-read-error'))
    reader.readAsDataURL(file)
  })
}

export async function askChat(
  message: string,
  language: 'en'|'my',
  assistant: AssistantKind = 'emergency',
  files?: File[]
): Promise<ChatResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const payloadFiles: ChatFilePayload[] = []
    if (files && files.length > 0) {
      for (const f of files) {
        try {
          const dataUrl = await fileToDataUrl(f)
          payloadFiles.push({ name: f.name, type: f.type, dataUrl })
        } catch (e) {
          console.warn('[chat.ts] failed reading file', f.name, e)
        }
      }
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, language, assistant, files: payloadFiles }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorText = await res.text()
      let errorMessage = 'Failed to get AI response'
      if (errorText) {
        try {
          const parsed = JSON.parse(errorText)
          errorMessage = parsed?.message || parsed?.error || parsed?.detail || errorMessage
        } catch {
          errorMessage = errorText
        }
      }
      throw new Error(errorMessage)
    }

    const data = await res.json()
    if (!data?.response) {
      throw new Error('Empty response from AI service')
    }

    return data as ChatResult
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

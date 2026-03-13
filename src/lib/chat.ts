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

// Direct Gemini API
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
const GEMINI_MODEL = 'gemini-2.5-flash'

// System prompts for different assistants
const SYSTEM_PROMPTS = {
  emergency: {
    en: "You are an AI assistant helping with earthquake & emergency safety. Be concise, practical, and safety-first. If this is a real emergency, remind the user to call 199.",
    my: "သင်သည် ငလျင်နှင့် အရေးပေါ် လုံခြုံရေးအကြံပြုမှုအတွက် ကူညီပေးသော AI ဖြစ်သည်။ တိုတောင်းသော်လည်း အသုံးဝင်အောင်ဖြေပါ။ တကယ်အရေးပေါ်ဖြစ်ပါက 199 ကို ခေါ်ရန် အမြဲသတိပေးပါ။"
  },
  mental: {
    en: "You are a warm, supportive mental-health companion (not a clinician). Respond with empathy and calming language. Offer grounding such as box breathing (4-4-4-4). If the user indicates crisis or self-harm risk, suggest contacting a trusted person or calling 199.",
    my: "သင်သည် နူးညံ့သိမ်မွေ့သော စိတ်ကျန်းမာရေး အကူအညီပေးသူ (ဆေးဘက်ဝင်မဟုတ်) ဖြစ်သည်။ နူးညံ့သိမ်မွေ့သောစကားဖြင့် အားပေးပါ။ အကွက်အသက်ရှူ ၄-၄-၄-၄ ကဲ့သို့သော ဂရောင်ဒင်းကို ပြောပြပါ။ အရေးကြီးစိုးရိမ်မှု/ကိုယ်ပိုင်အန္တရာယ်ရှိပါက ယုံကြည်ရသောသူ သို့မဟုတ် 199 ကို ဆက်သွယ်ရန် အကြံပြုပါ။"
  }
}

export async function askChat(
  message: string,
  language: 'en'|'my',
  assistant: AssistantKind = 'emergency',
  files?: File[]
): Promise<ChatResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    // Check if Gemini API key is configured
    if (!GEMINI_API_KEY) {
      console.warn('[chat.ts] GEMINI_API_KEY not configured, using local fallback')
      return localFallback(language, assistant)
    }

    // Build system prompt
    const systemPrompt = SYSTEM_PROMPTS[assistant][language]
    
    // Build Gemini API request body
    // Gemini uses a different format - combine system + user message
    const fullPrompt = `${systemPrompt}\n\nUser: ${message}`
    // If files are provided, encode them as data URLs and include inline in the prompt.
    // This keeps everything client-side (no DB). Be mindful of size limits.
    const fileParts: Array<string> = []
    if (files && files.length > 0) {
      for (const f of files) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('file-read-error'))
            reader.readAsDataURL(f)
          })
          // Add a short descriptor plus the data URL so Gemini receives the image inline.
          fileParts.push(`Attached file: ${f.name} (${f.type})\nDataURL: ${dataUrl}`)
        } catch (e) {
          console.warn('[chat.ts] failed reading file', f.name, e)
        }
      }
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: fileParts.length > 0 ? `${fullPrompt}\n\n${fileParts.join('\n\n')}` : fullPrompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: assistant === 'mental' ? 0.5 : 0.7,
        maxOutputTokens: 512,
      }
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      }
    )

    clearTimeout(timeout)

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[chat.ts] Gemini API error', res.status, errorText)
      return localFallback(language, assistant)
    }

    const json = await res.json()
    const content = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''

    if (!content.trim()) {
      console.warn('[chat.ts] Empty response from Gemini')
      return localFallback(language, assistant)
    }

    return {
      response: content,
      category: assistant === 'mental' ? 'mental' : 'general',
      timestamp: new Date().toISOString(),
      model: GEMINI_MODEL,
      online: true,
      error: false,
    }
  } catch (e) {
    console.error('[chat.ts] failed, local fallback', e)
    return localFallback(language, assistant)
  }
}

function localFallback(language:'en'|'my', assistant:AssistantKind): ChatResult {
  if (assistant === 'mental') {
    return {
      response: language==='en'
        ? "Let's try box breathing: inhale 4, hold 4, exhale 4, hold 4 (x4). You’re not alone. If you're in immediate danger, call 199 now."
        : 'အကွက်အသက်ရှူ ၄-၄-၄-၄ (၄ ကြိမ်) လေ့ကျင့်ပါ။ သင်တစ်ယောက်တည်း မဟုတ်ပါ။ အရေးပေါ် ဖြစ်ပါက 199 ကို ခေါ်ပါ။',
      category: 'mental',
      timestamp: new Date().toISOString(),
      model: 'local:fallback',
      error: true,
    }
  }
  return {
    response: language==='en'
      ? 'Stay safe: Drop, Cover, Hold On. Move away from windows. Call 199 for real emergencies.'
      : 'လုံခြုံရေးကို ဦးစားပေးပါ — ခေါင်းပု၊ ဖုံး၊ ကိုင် လေ့ကျင့်ပါ။ အရေးပေါ်ဖြစ်ပါက 199 ကို ခေါ်ပါ။',
    category: 'general',
    timestamp: new Date().toISOString(),
    model: 'local:fallback',
    error: true,
  }
}

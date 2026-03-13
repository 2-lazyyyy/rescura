import { NextRequest, NextResponse } from 'next/server'

type AssistantKind = 'emergency' | 'mental'
type Language = 'en' | 'my'
type ChatFilePayload = { name?: string; type?: string; dataUrl?: string }

const SYSTEM_PROMPTS: Record<AssistantKind, Record<Language, string>> = {
  emergency: {
    en: "You are an AI assistant helping with earthquake & emergency safety. Be concise, practical, and safety-first. If this is a real emergency, remind the user to call 199.",
    my: "သင်သည် ငလျင်နှင့် အရေးပေါ် လုံခြုံရေးအကြံပြုမှုအတွက် ကူညီပေးသော AI ဖြစ်သည်။ တိုတောင်းသော်လည်း အသုံးဝင်အောင်ဖြေပါ။ တကယ်အရေးပေါ်ဖြစ်ပါက 199 ကို ခေါ်ရန် အမြဲသတိပေးပါ။",
  },
  mental: {
    en: "You are a warm, supportive mental-health companion (not a clinician). Respond with empathy and calming language. Offer grounding such as box breathing (4-4-4-4). If the user indicates crisis or self-harm risk, suggest contacting a trusted person or calling 199.",
    my: "သင်သည် နူးညံ့သိမ်မွေ့သော စိတ်ကျန်းမာရေး အကူအညီပေးသူ (ဆေးဘက်ဝင်မဟုတ်) ဖြစ်သည်။ နူးညံ့သိမ်မွေ့သောစကားဖြင့် အားပေးပါ။ အကွက်အသက်ရှူ ၄-၄-၄-၄ ကဲ့သို့သော ဂရောင်ဒင်းကို ပြောပြပါ။ အရေးကြီးစိုးရိမ်မှု/ကိုယ်ပိုင်အန္တရာယ်ရှိပါက ယုံကြည်ရသောသူ သို့မဟုတ် 199 ကို ဆက်သွယ်ရန် အကြံပြုပါ။",
  },
}

function normalizeLanguage(input: unknown): Language {
  return input === 'my' ? 'my' : 'en'
}

function normalizeAssistant(input: unknown): AssistantKind {
  return input === 'mental' ? 'mental' : 'emergency'
}

function categorizeMessage(message: string, assistant: AssistantKind) {
  if (assistant === 'mental') return 'mental'
  const lowerMessage = message.toLowerCase()
  if (lowerMessage.includes('earthquake') || lowerMessage.includes('ငလျင်') ||
      lowerMessage.includes('shake') || lowerMessage.includes('tremor')) {
    return 'safety'
  }
  if (lowerMessage.includes('shelter') || lowerMessage.includes('ခိုလှုံရာ') ||
      lowerMessage.includes('location') || lowerMessage.includes('where')) {
    return 'location'
  }
  if (lowerMessage.includes('first aid') || lowerMessage.includes('medical') ||
      lowerMessage.includes('injury') || lowerMessage.includes('ပထမအကူအညီ') ||
      lowerMessage.includes('ဆေးရည်းအကူအညီ')) {
    return 'medical'
  }
  if (lowerMessage.includes('emergency') || lowerMessage.includes('help') ||
      lowerMessage.includes('danger') || lowerMessage.includes('အရေးပေါ်') ||
      lowerMessage.includes('urgent') || lowerMessage.includes('call')) {
    return 'emergency'
  }
  return 'general'
}

export async function POST(request: NextRequest) {
  try {
    const { message, language, assistant, files } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not set', message: 'AI service is not configured.' },
        { status: 500 }
      )
    }

    const normalizedLanguage = normalizeLanguage(language)
    const normalizedAssistant = normalizeAssistant(assistant)
    const systemPrompt = SYSTEM_PROMPTS[normalizedAssistant][normalizedLanguage]
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'

    const fileParts = Array.isArray(files)
      ? (files as ChatFilePayload[])
          .filter((f) => f?.dataUrl)
          .map((f) => {
            const name = f?.name || 'attachment'
            const type = f?.type || 'application/octet-stream'
            return `Attached file: ${name} (${type})\nDataURL: ${f?.dataUrl}`
          })
      : []

    const fullPrompt = fileParts.length
      ? `${systemPrompt}\n\nUser: ${message}\n\n${fileParts.join('\n\n')}`
      : `${systemPrompt}\n\nUser: ${message}`

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: normalizedAssistant === 'mental' ? 0.5 : 0.7,
        maxOutputTokens: 512,
      },
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json(
        { error: 'gemini_error', message: 'AI service error.', detail: errText },
        { status: 502 }
      )
    }

    const json = await resp.json()
    const content =
      json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''

    if (!content.trim()) {
      return NextResponse.json(
        { error: 'empty_response', message: 'Empty response from AI service.' },
        { status: 502 }
      )
    }

    const category = categorizeMessage(String(message), normalizedAssistant)

    return NextResponse.json({
      response: content,
      category,
      timestamp: new Date().toISOString(),
      model,
      online: true,
    })
  } catch (error) {
    console.error('Chat API Error:', error)
    return NextResponse.json(
      { error: 'server_error', message: 'Server error.', detail: String(error) },
      { status: 500 }
    )
  }
}
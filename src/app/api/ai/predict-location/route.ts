import { NextRequest, NextResponse } from 'next/server'
import { generateGeminiContent } from "@/lib/ai/gemini";
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId } = body || {}

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Fetch the last 5 locations for this user
    const { data: history, error } = await supabase
      .from('location_history')
      .select('lat, lng, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[predict-location] db error', error)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }

    if (!history || history.length < 2) {
      return NextResponse.json({ error: 'not_enough_data', message: 'Need at least 2 location points to predict trajectory.' }, { status: 400 })
    }

    // Sort ascending for the AI to understand the path
    const pathData = history.reverse().map(h => ({
      lat: h.lat,
      lng: h.lng,
      time: h.created_at
    }))

    const prompt = [
      "You are an expert tracking AI system used for disaster response.",
      "Below are the recent GPS coordinates and timestamps of a missing person.",
      "Analyze their speed and direction of travel.",
      "Predict where they will be 30 minutes after their LAST recorded timestamp.",
      "Return ONLY a strict JSON object with NO markdown formatting, NO prose, NO backticks.",
      "Schema: { \"lat\": number, \"lng\": number, \"confidence\": number (0-1), \"reason\": string }",
      "Data:",
      JSON.stringify(pathData, null, 2),
      "JSON Output:"
    ].join("\n")

    const { data } = await generateGeminiContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })

    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!text) {
      throw new Error("No text returned from Gemini")
    }

    // Clean JSON
    const jsonStart = text.indexOf("{")
    const jsonEnd = text.lastIndexOf("}")
    const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text
    
    const parsed = JSON.parse(raw)
    
    return NextResponse.json({
      success: true,
      prediction: {
        lat: parsed.lat,
        lng: parsed.lng,
        confidence: parsed.confidence,
        reason: parsed.reason
      }
    })

  } catch (err: any) {
    console.error('[predict-location] error', err)
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

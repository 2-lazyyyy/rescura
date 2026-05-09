/**
 * Gemini API Helper with Automatic Key Switching
 * Tries the primary GEMINI_API_KEY first, and falls back to GEMINI_API_KEY_ALT if it fails.
 */

export interface GeminiContentPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

export interface GeminiRequestPayload {
  contents: {
    role: "user" | "model";
    parts: GeminiContentPart[];
  }[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
}

export async function generateGeminiContent(payload: GeminiRequestPayload): Promise<{ data: any; status: number }> {
  const primaryKey = process.env.GEMINI_API_KEY;
  const altKey = process.env.GEMINI_API_KEY_ALT;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  if (!primaryKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const attemptCall = async (key: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp;
  };

  // Try Primary Key
  let response = await attemptCall(primaryKey);

  // If primary fails (especially 429 Too Many Requests) and we have an alt key
  if (!response.ok && altKey) {
    console.warn(`[AI] Primary key failed (Status: ${response.status}). Attempting ALT key...`);
    const altResponse = await attemptCall(altKey);
    
    if (altResponse.ok) {
      const data = await altResponse.json();
      return { data, status: altResponse.status };
    } else {
      const errorText = await altResponse.text();
      throw new Error(`Both Gemini keys failed. Primary status: ${response.status}. Alt status: ${altResponse.status}. Alt error: ${errorText}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Primary Key Error (Status ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return { data, status: response.status };
}

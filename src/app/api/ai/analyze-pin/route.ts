import { NextResponse } from "next/server";
import { generateGeminiContent } from "@/lib/ai/gemini";

type Suggestion = {
  isValid: boolean;
  reason: string;
  severity: number;
  categories: string[];
  items: SuggestionItem[];
  confidence: number;
};

type SuggestionItem = {
  name: string;
  qty: number;
};

function toCanonicalAllowed(name: string, allowed?: string[]): string | null {
  if (!allowed || allowed.length === 0) return name;
  const ln = name.toLowerCase().trim();
  // exact match
  for (const a of allowed) if (a.toLowerCase() === ln) return a;
  // contains/substring match
  const scored = allowed
    .map((a) => {
      const la = a.toLowerCase();
      let score = 0;
      if (la.includes(ln) || ln.includes(la)) score += 2;
      // basic stem-ish checks
      if (ln.replace(/s$/,"") === la.replace(/s$/,"")) score += 1;
      return { a, score };
    })
    .sort((x, y) => y.score - x.score);
  return scored[0]?.score ? scored[0].a : null;
}

function heuristicAnalyze(description: string, allowed?: string[]): Suggestion {
  const text = description.toLowerCase();

  let severity = 0.3;
  let confidence = 0.2;
  const categories: string[] = [];
  const items: SuggestionItem[] = [];

  const addCat = (c: string) => {
    if (!categories.includes(c)) categories.push(c);
  };

  const criticalWords = ["injured", "injury", "hurt", "hurted", "died", "death", "fatal", "collapsed", "collapse", "trapped"];
  const fireWords = ["fire", "burn", "smoke"];
  const floodWords = ["flood", "water rising", "submerged", "drown"];

  if (criticalWords.some((w) => text.includes(w))) {
    severity += 0.35;
    confidence += 0.3;
    addCat("medical");
    addCat("structural");
  }
  if (text.includes("collapsed") || text.includes("collapse") || text.includes("building")) {
    severity += 0.25;
    confidence += 0.2;
    addCat("structural");
  }
  if (fireWords.some((w) => text.includes(w))) {
    severity += 0.2;
    addCat("fire");
  }
  if (floodWords.some((w) => text.includes(w))) {
    severity += 0.2;
    addCat("flooding");
  }

  // Quantities
  const numberWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };

  const asNumber = (s: string) => {
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n;
    const nw = numberWords[s.toLowerCase()];
    return nw !== undefined ? nw : NaN;
  };

  const tokens = text.split(/[^a-z0-9]+/g).filter(Boolean);
  let injuredCount = 0;
  let fatalCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (["injured", "injury", "hurt", "hurted"].includes(tok)) {
      const n = asNumber(tokens[i - 1] || tokens[i + 1] || "");
      if (!isNaN(n)) injuredCount = Math.max(injuredCount, n);
    }
    if (["dead", "died", "fatal", "fatality", "death"].includes(tok)) {
      const n = asNumber(tokens[i - 1] || tokens[i + 1] || "");
      if (!isNaN(n)) fatalCount = Math.max(fatalCount, n);
      else fatalCount = Math.max(fatalCount, 1);
    }
  }

  if (injuredCount > 0) {
    items.push({ name: "First Aid", qty: Math.max(1, injuredCount) });
    items.push({ name: "Blankets", qty: Math.max(2, injuredCount) });
    items.push({ name: "Medicine Box", qty: 1 });
    severity += Math.min(0.25, injuredCount * 0.05);
    confidence += 0.15;
  }
  if (fatalCount > 0) {
    severity = Math.max(severity, 0.9);
    confidence += 0.1;
    addCat("critical");
  }

  if (criticalWords.some((w) => text.includes(w)) || text.includes("collapsed")) {
    items.push({ name: "Water Bottles", qty: Math.max(12, injuredCount * 6) });
  }

  severity = Math.min(1, Math.max(0, severity));
  confidence = Math.min(1, Math.max(0.2, confidence));
  if (categories.length === 0) categories.push("general");

  const merged: Record<string, number> = {};
  for (const it of items) {
    const canon = toCanonicalAllowed(it.name, allowed);
    if (!canon) continue;
    merged[canon] = (merged[canon] || 0) + it.qty;
  }
  const mergedItems = Object.entries(merged).map(([name, qty]) => ({ name, qty }));

  return { isValid: true, reason: "Analyzed based on keywords.", severity, categories, items: mergedItems, confidence };
}

export async function POST(req: Request) {
  try {
    const { description, imageBase64, imageMime, allowedItems, location } = (await req.json()) as {
      description?: string;
      imageBase64?: string;
      imageMime?: string;
      allowedItems?: string[];
      location?: { lat: number, lng: number };
    };

    if (!description || !description.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const allowedSection = Array.isArray(allowedItems) && allowedItems.length
          ? ["Allowed item names:", ...allowedItems.map((n) => `- ${n}`)].join("\n")
          : "";

        const prompt = [
          "You are an emergency triage assistant. Return STRICT JSON only.",
          "Schema: { \"isValid\": boolean, \"reason\": string, \"severity\": number, \"categories\": string[], \"items\": Array<{name:string, qty:number}>, \"confidence\": number }",
          "Rules: use only allowed item names. Max 10 items.",
          allowedSection,
          "Description:",
          description,
          location ? `Location: Lat ${location.lat}, Lng ${location.lng}` : "",
          "JSON only:",
        ].join("\n");

        const parts: any[] = [{ text: prompt }];
        if (imageBase64 && imageMime) {
          parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
        }

        const { data } = await generateGeminiContent({
          contents: [{ role: "user", parts }],
        });

        const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          try {
            const jsonStart = text.indexOf("{");
            const jsonEnd = text.lastIndexOf("}");
            const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
            const parsed = JSON.parse(raw) as Suggestion;
            
            let items: SuggestionItem[] = Array.isArray(parsed.items)
              ? parsed.items
                  .map((it: any) => ({ name: String(it.name || ""), qty: Math.max(1, Number(it.qty) || 1) }))
                  .filter((it: any) => it.name && it.qty)
                  .slice(0, 10)
              : [];

            if (Array.isArray(allowedItems) && allowedItems.length) {
              const mapped: Record<string, number> = {};
              for (const it of items) {
                const canon = toCanonicalAllowed(it.name, allowedItems);
                if (!canon) continue;
                mapped[canon] = (mapped[canon] || 0) + it.qty;
              }
              items = Object.entries(mapped).map(([name, qty]) => ({ name, qty }));
            }

            const suggestion: Suggestion = {
              isValid: !!parsed.isValid,
              reason: String(parsed.reason || ""),
              severity: Math.min(1, Math.max(0, parsed.severity ?? 0.5)),
              categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 5) : ["general"],
              items: parsed.isValid ? items : [],
              confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.6)),
            };
            return NextResponse.json({ suggestion, source: "gemini" });
          } catch (e) {
            console.warn("Failed to parse Gemini JSON, falling back to heuristic", e);
          }
        }
      } catch (err) {
        console.error("Gemini API error, falling back to heuristic", err);
      }
    }

    // Heuristic Fallback
    const suggestion = heuristicAnalyze(description, allowedItems);
    return NextResponse.json({ suggestion, source: "heuristic" });
  } catch (e: any) {
    console.error("AI Analysis Error:", e);
    return NextResponse.json({ error: "Failed to analyze", message: e.message }, { status: 500 });
  }
}

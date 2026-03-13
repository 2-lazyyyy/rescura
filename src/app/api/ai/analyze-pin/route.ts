import { NextResponse } from "next/server";

type SuggestionItem = { name: string; qty: number };
type Suggestion = {
  severity: number;
  categories: string[];
  items: SuggestionItem[];
  confidence: number;
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
  // e.g., "2 injured", "two injured", "20 water", "10 blankets"
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };

  const numFromWord = (w: string) => (w in numberWords ? numberWords[w] : NaN);

  const tokens = text.split(/[^a-z0-9]+/g).filter(Boolean);
  const asNumber = (s: string) => {
    const n = parseInt(s, 10);
    if (!isNaN(n)) return n;
    const nw = numFromWord(s);
    return isNaN(nw) ? NaN : nw;
  };

  const getNextNumber = (i: number) => asNumber(tokens[i + 1] || "");

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

  // Generic supplies if any strong signal
  if (criticalWords.some((w) => text.includes(w)) || text.includes("collapsed")) {
    items.push({ name: "Water Bottles", qty: Math.max(12, injuredCount * 6) });
  }

  severity = Math.min(1, Math.max(0, severity));
  confidence = Math.min(1, Math.max(0.2, confidence));

  if (categories.length === 0) categories.push("general");

  // Map to allowed names and merge
  const merged: Record<string, number> = {};
  for (const it of items) {
    const canon = toCanonicalAllowed(it.name, allowed);
    if (!canon) continue;
    merged[canon] = (merged[canon] || 0) + it.qty;
  }
  const mergedItems = Object.entries(merged).map(([name, qty]) => ({ name, qty }));

  return { severity, categories, items: mergedItems, confidence };
}

export async function POST(req: Request) {
  try {
    const { description, imageBase64, imageMime, allowedItems } = (await req.json()) as {
      description?: string;
      imageBase64?: string;
      imageMime?: string;
      allowedItems?: string[];
    };
    if (!description || !description.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (apiKey) {
      try {
        const allowedSection = Array.isArray(allowedItems) && allowedItems.length
          ? [
              "Allowed item names (must use only these):",
              ...allowedItems.map((n) => `- ${n}`),
            ].join("\n")
          : "";

        const prompt = [
          "You are an emergency triage assistant.",
          "Return STRICT JSON only (no prose).",
          "Schema: {",
          "  \"severity\": number (0..1),",
          "  \"categories\": string[],",
          "  \"items\": Array<{ name: string, qty: number }>,",
          "  \"confidence\": number (0..1)",
          "}",
          "Rules:",
          "- categories from: [structural, medical, flooding, fire, general, critical] (choose any).",
          "- items must use names from the allowed list only; if none apply, return an empty items array.",
          "- qty must be positive integers; max 10 items.",
          "- If uncertain, still return best-guess with reasonable qty.",
          allowedSection,
          "Description:",
          description,
          "JSON only:",
        ].join("\n");

        const parts: any[] = [{ text: prompt }];
        if (imageBase64 && imageMime) {
          parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
        }

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts,
                },
              ],
            }),
          }
        );
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            try {
              const jsonStart = text.indexOf("{");
              const jsonEnd = text.lastIndexOf("}");
              const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
              const parsed = JSON.parse(raw) as Suggestion;
              // Clamp and normalize
              let items: SuggestionItem[] = Array.isArray(parsed.items)
                ? parsed.items
                    .map((it: any) => ({ name: String(it.name || ""), qty: Math.max(1, Number(it.qty) || 1) }))
                    .filter((it: any) => it.name && it.qty)
                    .slice(0, 10)
                : [];
              // Enforce allowed list mapping
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
                severity: Math.min(1, Math.max(0, parsed.severity ?? 0.5)),
                categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 5) : ["general"],
                items,
                confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.6)),
              };
              return NextResponse.json({ suggestion, source: "gemini" });
            } catch {
              // fallthrough to heuristic
            }
          }
        }
      } catch {
        // fallthrough to heuristic
      }
    }

    const suggestion = heuristicAnalyze(description, allowedItems);
    return NextResponse.json({ suggestion, source: "heuristic" });
  } catch (e) {
    return NextResponse.json({ error: "Failed to analyze" }, { status: 500 });
  }
}

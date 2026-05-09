export interface KnowledgeItem {
  id: string;
  keywords: string[];
  title: string;
  content: string;
}

export const FIRST_AID_KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "bleeding",
    keywords: ["bleed", "bleeding", "cut", "wound", "blood", "hemorrhage"],
    title: "Severe Bleeding",
    content: "1. Apply direct continuous pressure to the wound with a clean cloth or bandage. 2. If blood soaks through, add more layers, do not remove the first layer. 3. Keep the injured area elevated above the heart if possible. 4. If bleeding doesn't stop, apply a tourniquet 2-3 inches above the wound, noting the time."
  },
  {
    id: "burns",
    keywords: ["burn", "burns", "fire", "scald", "hot"],
    title: "Burns",
    content: "1. Cool the burn under cool (not ice cold) running water for at least 10-15 minutes. 2. Remove tight items like rings or belts from the burned area before it swells. 3. Cover the burn loosely with a sterile, non-stick bandage or clean cloth. 4. Do NOT apply ointments, butter, or pop blisters."
  },
  {
    id: "snake_bite",
    keywords: ["snake", "bite", "bitten", "venom", "cobra", "viper"],
    title: "Snake Bite",
    content: "1. Keep the person calm and still to slow the spread of venom. 2. Remove rings or constricting items from the bitten limb. 3. Immobilize the limb and keep it at or slightly below heart level. 4. Do NOT suck the venom, cut the wound, or apply a tourniquet. Wash the bite with soap and water."
  },
  {
    id: "choking",
    keywords: ["choke", "choking", "can't breathe", "swallow", "stuck"],
    title: "Choking (Adult/Child)",
    content: "1. Stand behind the person and wrap your arms around their waist. 2. Make a fist and place it just above the navel. 3. Grasp your fist with your other hand and give quick, upward thrusts (Heimlich maneuver). 4. Continue until the object is expelled."
  },
  {
    id: "cpr",
    keywords: ["cpr", "heart attack", "unconscious", "not breathing", "pulse"],
    title: "CPR (Hands-Only)",
    content: "1. Check for responsiveness and normal breathing. 2. If no breathing, place the heel of one hand in the center of the chest, place the other hand on top and interlock fingers. 3. Push hard and fast (100-120 compressions per minute) at least 2 inches deep. 4. Allow the chest to fully recoil between compressions. Do not stop until help arrives or they wake up."
  },
  {
    id: "fracture",
    keywords: ["broken", "bone", "fracture", "snap", "leg", "arm"],
    title: "Bone Fracture",
    content: "1. Do not move the person unless necessary. 2. Immobilize the injured area; do not try to realign the bone. 3. Apply a homemade splint if you must move them, tying it above and below the joint. 4. Apply ice packs wrapped in cloth to reduce swelling."
  },
  {
    id: "drowning",
    keywords: ["drown", "drowning", "water", "pool", "river", "sea"],
    title: "Drowning",
    content: "1. Get the person out of the water safely. 2. Check for breathing. If they are not breathing, begin CPR immediately. 3. Do NOT try to clear water from the lungs by pressing on the stomach. 4. Keep them warm to prevent hypothermia."
  },
  {
    id: "panic_attack",
    keywords: ["panic", "anxiety", "scared", "can't breathe", "mental", "stress"],
    title: "Panic Attack",
    content: "1. Stay with the person and keep calm. 2. Offer reassurance: 'You are safe, I am here.' 3. Encourage slow, deep breaths (breathe in for 4 seconds, hold for 4, exhale for 4). 4. Move them to a quiet place if possible."
  }
];

export function retrieveKnowledge(query: string): KnowledgeItem | null {
  const lowercaseQuery = query.toLowerCase();
  const words = lowercaseQuery.split(/[\s,.-]+/); // Basic tokenization
  
  let bestMatch: KnowledgeItem | null = null;
  let maxScore = 0;

  for (const item of FIRST_AID_KNOWLEDGE) {
    let score = 0;
    for (const word of words) {
      if (word.length < 3) continue; // Skip small words
      if (item.keywords.includes(word)) {
        score += 2; // Exact keyword match is strong
      } else if (item.keywords.some(k => k.includes(word) || word.includes(k))) {
        score += 1; // Partial match
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  // Only return if we found a reasonable match
  return maxScore >= 1 ? bestMatch : null;
}

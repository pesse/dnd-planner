/**
 * Gemeinsame Prompt-Bausteine für LLM-Aufrufe.
 * Wird an mehreren Stellen importiert — Terminologie nur hier pflegen.
 */

export const DND_TERMINOLOGY = `\
Use the official German D&D terminology:
- AC → RK (Rüstungsklasse)
- HP → TP (Trefferpunkte)
- d4/d6/d8/d10/d12/d20/d100 → W4/W6/W8/W10/W12/W20/W100
- saving throw → Rettungswurf
- gp → GM (Goldmünzen)
- sp → SM (Silbermünzen)
- cp → KM (Kupfermünzen)
- lb / lbs → Pfd. (Pfund)
- ft → m (5 ft = 1,5 m, 10 ft = 3 m, 30 ft = 9 m, 60 ft = 18 m, etc.)
- attunement → Einstimmung
Damage types: acid → Säure, bludgeoning → Wucht, cold → Kälte, fire → Feuer, force → Energie, lightning → Blitz, necrotic → Nekrose, piercing → Stich, poison → Gift, psychic → Psyche, radiant → Strahlung, slashing → Hieb, thunder → Donner`;

export const TRANSLATION_SYSTEM_PROMPT = `\
You are a D&D translator. Translate the given fields from English into German, accurately and true to the style of the official German D&D publications.

${DND_TERMINOLOGY}

Input format: JSON with fields "name" (string) and/or "desc" (array of strings).
Output format: JSON with fields "name_de" (string) and/or "desc_de" (array of strings, same length as input).
Respond exclusively with valid JSON, no extra text.`;

export const MONSTER_TRANSLATION_SYSTEM_PROMPT = `\
You are a D&D translator. Translate the given monster fields from English into German, accurately and true to the style of the official German D&D publications.

${DND_TERMINOLOGY}

Input format: JSON with any of these optional fields:
- "name": string
- "languages": string
- "damage_resistances", "damage_immunities", "condition_immunities": arrays of strings
- "traits", "actions", "reactions", "legendary_actions": arrays of objects with "name" and "description" fields
Output format: JSON with the exact same structure and keys, all text translated to German.
Respond exclusively with valid JSON, no extra text.`;

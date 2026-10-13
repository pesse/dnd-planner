/**
 * Hintergrund-Attributserhöhung (SRD 5.2): drei zulässige Attribute, verteilt als +2/+1
 * oder +1/+1/+1 — Validierung und Anwendung, ohne die Wahl selbst.
 */
import { readAbilityName } from '$lib/schemas/vocabulary';
import { abilityKeyOf, ABILITY_KEYS, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';

/** Verteilte Erhöhungen je Attribut; fehlender Schlüssel = 0. */
export type AsiAllocation = Partial<Record<AbilityKey, number>>;

export const BACKGROUND_ASI_TOTAL = 3;

/** Unbekannte Einträge fallen tolerant heraus — der Aufrufer zeigt nur Aufgelöstes, statt zu raten. */
export function allowedKeys(abilityScores: string[]): AbilityKey[] {
  const out: AbilityKey[] = [];
  for (const raw of abilityScores) {
    const key = abilityKeyOf(readAbilityName(raw));
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export function allocatedTotal(alloc: AsiAllocation): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + (alloc[k] ?? 0), 0);
}

export function isValidAllocation(alloc: AsiAllocation, allowed: AbilityKey[]): boolean {
  const entries = ABILITY_KEYS.map((k) => [k, alloc[k] ?? 0] as const).filter(([, v]) => v > 0);
  if (allocatedTotal(alloc) !== BACKGROUND_ASI_TOTAL) return false;
  if (entries.some(([k, v]) => !allowed.includes(k) || v < 1 || v > 2)) return false;
  const pattern = entries.map(([, v]) => v).sort((a, b) => b - a).join('');
  return pattern === '21' || pattern === '111';
}

/** Additiv, ohne Obergrenze — die Zielwerte gehen bis 17. */
export function applyAsi(base: AbilityScores, alloc: AsiAllocation): AbilityScores {
  const next = { ...base };
  for (const k of ABILITY_KEYS) next[k] = base[k] + (alloc[k] ?? 0);
  return next;
}

/**
 * Vorschlag: +2 auf das stärkste zulässige Hauptattribut, +1 auf den nächsthöchsten Wert —
 * ohne zulässiges Hauptattribut +1/+1/+1.
 */
export function suggestAsi(allowed: AbilityKey[], primary: AbilityKey[], scores: AbilityScores): AsiAllocation {
  const byScore = [...allowed].sort((a, b) => scores[b] - scores[a]);
  const main = byScore.find((k) => primary.includes(k));
  if (!main) return Object.fromEntries(allowed.slice(0, 3).map((k) => [k, 1]));
  const second = byScore.find((k) => k !== main);
  return second ? { [main]: 2, [second]: 1 } : { [main]: 2 };
}

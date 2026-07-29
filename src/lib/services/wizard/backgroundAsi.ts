/**
 * Hintergrund-Attributserhöhung (SRD 5.2 / PHB 2024) — die Mechanik, die in der
 * App bisher als Daten vorlag (`background.abilityScores`), aber nie auf die
 * Charakterwerte angewandt wurde.
 *
 * Ein Hintergrund nennt drei Attribute; der Spieler verteilt entweder +2/+1 auf
 * zwei davon oder +1/+1/+1 auf alle drei. Diese Verteilung ist eine Nutzerwahl —
 * hier stehen nur die reine Validierung und das Anwenden auf die Werte.
 *
 * Rein deterministisch, framework-frei. Arbeitet auf denselben deutschen
 * Attribut-Schlüsseln wie `pointBuy.ts` (VOR-ASI-Basiswerte + diese Erhöhung).
 */
import { ABILITY_TO_EN } from '$lib/schemas/classProgression';
import { readAbilityName, type AbilityName } from '$lib/schemas/shared';
import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from './pointBuy';

/** Verteilte Erhöhungen je Attribut (0, 1 oder 2). Fehlende Schlüssel = 0. */
export type AsiAllocation = Partial<Record<AbilityKey, number>>;

/** Der Gesamtbonus, den ein Hintergrund vergibt (2024: immer +3). */
export const BACKGROUND_ASI_TOTAL = 3;

/** Englischer SRD-Attributsname → deutscher App-Schlüssel (Umkehrung von ABILITY_TO_EN). */
const KEY_BY_EN = new Map<AbilityName, AbilityKey>(
  (Object.entries(ABILITY_TO_EN) as [AbilityKey, AbilityName][]).map(([key, en]) => [en, key]),
);

/**
 * Die drei zulässigen Attribute eines Hintergrunds als deutsche Schlüssel.
 * Unbekannte/leere Einträge fallen tolerant heraus (der Aufrufer zeigt dann nur,
 * was er auflösen konnte, statt zu raten).
 */
export function allowedKeys(abilityScores: string[]): AbilityKey[] {
  const out: AbilityKey[] = [];
  for (const raw of abilityScores) {
    const en = readAbilityName(raw);
    const key = en ? KEY_BY_EN.get(en) : undefined;
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Summe der verteilten Punkte. */
export function allocatedTotal(alloc: AsiAllocation): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + (alloc[k] ?? 0), 0);
}

/**
 * true, wenn die Verteilung regelkonform ist: nur zulässige Attribute, jeder Wert
 * 1 oder 2, Summe = 3, und genau eines der beiden 2024-Muster — +2/+1 (zwei
 * Attribute) ODER +1/+1/+1 (drei Attribute).
 */
export function isValidAllocation(alloc: AsiAllocation, allowed: AbilityKey[]): boolean {
  const entries = ABILITY_KEYS.map((k) => [k, alloc[k] ?? 0] as const).filter(([, v]) => v > 0);
  if (allocatedTotal(alloc) !== BACKGROUND_ASI_TOTAL) return false;
  if (entries.some(([k, v]) => !allowed.includes(k) || v < 1 || v > 2)) return false;
  const pattern = entries.map(([, v]) => v).sort((a, b) => b - a).join('');
  return pattern === '21' || pattern === '111';
}

/** Wendet die Erhöhungen additiv auf die Basiswerte an (keine Obergrenze — Ziel bis 17). */
export function applyAsi(base: AbilityScores, alloc: AsiAllocation): AbilityScores {
  const next = { ...base };
  for (const k of ABILITY_KEYS) next[k] = base[k] + (alloc[k] ?? 0);
  return next;
}

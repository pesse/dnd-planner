/**
 * Das EINE Attributs-Vokabular: der Schlüsselsatz ist zugleich die kleingeschriebene
 * SRD-Abkürzung (Bibliothek, Monster, NPC, Zauber, Charakter). Deutsch bleibt an zwei
 * Rändern: den Anzeigelabels hier (`ABILITY_ABBR_DE`, `ABILITY_LABEL`) und den
 * PDF-Feldnamen des Taendler-Bogens (`pdf/characterFields.ts`), die das Formular diktiert.
 */
import { z } from 'zod';

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export type AbilityScores = Record<AbilityKey, number>;

export const ABILITY_NAMES = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
] as const;
export type AbilityName = (typeof ABILITY_NAMES)[number];

export const ABILITY_ABBR: Record<AbilityKey, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

export const ABILITY_ABBR_DE: Record<AbilityKey, string> = {
  str: 'STR', dex: 'GES', con: 'KON', int: 'INT', wis: 'WEI', cha: 'CHA',
};

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Stärke', dex: 'Geschicklichkeit', con: 'Konstitution',
  int: 'Intelligenz', wis: 'Weisheit', cha: 'Charisma',
};

const NAME_TO_KEY = new Map<string, AbilityKey>(
  ABILITY_NAMES.map((name, i) => [name.toLowerCase(), ABILITY_KEYS[i]]),
);

/** Beliebige Schreibweise auf den Schlüssel („Wisdom", „wisdom", „ wis ") — der LLM-/Open5e-Rand. */
export function abilityKeyOf(raw: string | undefined | null): AbilityKey | undefined {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  const byName = NAME_TO_KEY.get(s);
  if (byName) return byName;
  return (ABILITY_KEYS as readonly string[]).includes(s) ? (s as AbilityKey) : undefined;
}

const abilityRecord = <T extends z.ZodTypeAny>(field: T) =>
  z.object(Object.fromEntries(ABILITY_KEYS.map((k) => [k, field])) as Record<AbilityKey, T>);

export const abilityScoresSchema = abilityRecord(z.number().int().default(10)).default(
  () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])) as AbilityScores,
);

export const abilityModsSchema = abilityRecord(z.number().int().default(0)).default(
  () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0])) as AbilityScores,
);

export const abilityFlagsSchema = abilityRecord(z.boolean().default(false)).default(
  () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, false])) as Record<AbilityKey, boolean>,
);
export type AbilityFlags = z.infer<typeof abilityFlagsSchema>;

/** Monster/NPC: sechs Pflichtfelder ohne Einzel-Default, ein Default fürs ganze Objekt. */
export const abilityStatsSchema = abilityRecord(z.number().int()).default(
  () => Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])) as AbilityScores,
);
export type AbilityStats = z.infer<typeof abilityStatsSchema>;

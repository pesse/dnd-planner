/**
 * Das EINE Attributs-Vokabular: englische SRD-Namen (Bibliothek), deutsche
 * Bogen-Schlüssel (Charakter, vom PDF-Formular diktiert) und die Brücke dazwischen.
 * Eine zweite Fassung davon läuft unweigerlich auseinander — es gab schon sechs.
 */

export const ABILITY_NAMES = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
] as const;
export type AbilityName = (typeof ABILITY_NAMES)[number];

/** App-/Bogen-Schlüssel (dex→ges, wis→wei), Reihenfolge wie auf dem Bogen. */
export const ABILITY_KEYS = ['str', 'ges', 'kon', 'int', 'wei', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export type AbilityScores = Record<AbilityKey, number>;

export const ABILITY_TO_EN: Record<AbilityKey, AbilityName> = {
  str: 'Strength', ges: 'Dexterity', kon: 'Constitution',
  int: 'Intelligence', wei: 'Wisdom', cha: 'Charisma',
};

export const ABILITY_KEY_BY_EN: Record<AbilityName, AbilityKey> = Object.fromEntries(
  ABILITY_KEYS.map((k) => [ABILITY_TO_EN[k], k]),
) as Record<AbilityName, AbilityKey>;

/** Kleingeschriebener englischer Name → Bogen-Schlüssel; v2-Daten kommen so. */
export const ABILITY_FROM_EN: Record<string, AbilityKey> = Object.fromEntries(
  ABILITY_KEYS.map((k) => [ABILITY_TO_EN[k].toLowerCase(), k]),
);

/** Bogen-Schlüssel zu beliebiger Schreibweise („Wisdom", „wisdom", „ wei "). */
export function abilityKeyOf(raw: string | undefined | null): AbilityKey | undefined {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (ABILITY_FROM_EN[s]) return ABILITY_FROM_EN[s];
  return (ABILITY_KEYS as readonly string[]).includes(s) ? (s as AbilityKey) : undefined;
}

/**
 * Die deutschen Attributsnamen. Der einzige Ort — vier gleichlautende Tabellen
 * standen vorher in levelUpMachine, characterProtocol, spellcasting und dem Wizard.
 */
export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution',
  int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};

export const ABILITY_LABEL_DE: Record<AbilityName, string> = Object.fromEntries(
  ABILITY_KEYS.map((k) => [ABILITY_TO_EN[k], ABILITY_LABEL[k]]),
) as Record<AbilityName, string>;

/**
 * Adapter über Open5e v2 (`/v2/classes/{key}`), bewusst OFFEN gehalten: `levels[].columns`
 * ist eine freie Map, damit beliebige Homebrew- und 2024-Spalten überleben statt in
 * Catch-alls zu verschwinden — v2 liefert die Stufentabelle selbst datengetrieben.
 */
import { z } from 'zod';
import { sourceField, migrateSourceLegacy } from './source';
import { proficiencyGrantSchema, skillGrantSchema, emptyProficiencyGrant, emptySkillGrant } from './grants';
import { featureDeclarationFields } from './featureChoice';
import { type AbilityName } from './abilities';

import { ABILITY_KEYS, type AbilityKey } from './abilities';
export { ABILITY_KEYS, type AbilityKey };

export const classLevelSchema = z.object({
  level: z.number().int().min(1).max(20),
  columns: z.record(z.string(), z.string()).default({}), // Rohwerte wie in v2
});

/** `gainedAt` kann mehrere Stufen enthalten (z.B. ASI 4/8/12/16). */
export const classFeatureSchema = z.object({
  key: z.string().default(''),
  name: z.string(),
  nameDe: z.string().optional(),
  gainedAt: z.array(z.number().int()).default([]),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  featureType: z.string().optional(),
  // Die drei Deklarationen (featureChoice.ts). Vom Vault gepflegt, NICHT aus Open5e importiert
  // (`mapV2` lässt sie leer) — ein Re-Import darf sie nicht überschreiben.
  ...featureDeclarationFields,
});

export const classProgressionSchema = z.object({
  key: z.string().describe('Open5e-v2-Key, z.B. "srd-2024_wizard".'),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  subclassOf: z
    .string()
    .optional()
    .describe('v2-Key der Basisklasse, falls dies eine Subklasse ist (z.B. "srd-2024_fighter").'),
  casterType: z.string().default('NONE').describe('v2 caster_type: FULL/HALF/NONE/…'),
  hitDie: z.number().int().default(0).describe('Seitenzahl aus "D6" → 6.'),
  hpAt1st: z.string().default(''),
  hpHigher: z.string().default(''),
  /** Bei Subklassen leer — die Kerntabelle hängt an der Grundklasse. */
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  /**
   * Steht NICHT in Open5e v2, nur im SRD-Abschnitt „Als Charakter mit Klassenkombination" —
   * wird im Vault gepflegt und muss einen Re-Import überleben.
   */
  skillGrantMulticlass: skillGrantSchema.default(emptySkillGrant),
  /**
   * Prosa statt Grant: die Kerntabelle nennt Pakete und Wahloptionen („Choose (A) … or (B)
   * 155 GP"), kein einzelnes Item — ein Grant hätte kein Ziel. Die ENGLISCHE Fassung geht
   * in den Wizard-Prompt, die deutsche ist reine Anzeige und darf fehlen.
   */
  startingEquipment: z.string().default(''),
  startingEquipmentDe: z.string().default(''),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
  levels: z.array(classLevelSchema).default([]),
  features: z.array(classFeatureSchema).default([]),
});

export type ClassLevel = z.infer<typeof classLevelSchema>;
export type ClassFeature = z.infer<typeof classFeatureSchema>;
export type ClassProgression = z.infer<typeof classProgressionSchema>;

/**
 * Vor-Schema-Kürzel dieses Altfelds — nicht die heutige `AbilityKey`-Schreibweise, die
 * Kürzel dieser Zeit waren die deutschen Bogen-Schlüssel von damals.
 */
const LEGACY_SAVE_ABILITY: Record<string, AbilityName> = {
  str: 'Strength', ges: 'Dexterity', kon: 'Constitution',
  int: 'Intelligence', wei: 'Wisdom', cha: 'Charisma',
};

/**
 * Altformat `savingThrows: ['kon','str']` → `proficiencyGrant.savingThrows`
 * (englische Namen). Das alte Feld wird entfernt, damit keine zweite Wahrheit bleibt.
 */
export function migrateClassLegacy(raw: unknown): Record<string, unknown> {
  const obj = migrateSourceLegacy(raw as Record<string, unknown>);
  const legacy = obj.savingThrows;
  delete obj.savingThrows;
  if (!Array.isArray(legacy) || !legacy.length) return obj;

  const grant = (obj.proficiencyGrant ?? {}) as Record<string, unknown>;
  if (!Array.isArray(grant.savingThrows) || !grant.savingThrows.length) {
    grant.savingThrows = legacy
      .map((k) => LEGACY_SAVE_ABILITY[k as string])
      .filter((n): n is AbilityName => Boolean(n));
    obj.proficiencyGrant = grant;
  }
  return obj;
}

/**
 * Interner, bewusst OFFENER Typ für Klassen-Progression — ein dünner Adapter über
 * das Open5e-**v2**-Format (`/v2/classes/{key}`), NICHT eine starre SRD-Projektion.
 *
 * v2 liefert die Stufentabelle datengetrieben (jede Spalte — „1st"…„9th",
 * „Proficiency Bonus", „Cantrips", „Rages", „Weapon Mastery", … — ist ein Feature
 * mit `data_for_class_table`). Diesem Prinzip folgt der Typ: `levels[].columns` ist
 * eine offene Map, damit beliebige (auch Homebrew-/2024-)Spalten überleben statt in
 * Catch-alls zu verschwinden. Merkmale tragen `gainedAt` (mehrere Stufen möglich).
 *
 * Zweck des Adapters: Entkopplung von Open5e-Churn/künftigen Quellen, Trimmen des
 * v2-Ballasts (crossreferences/permalinks), stabile Feldnamen, Zod-Validierung für
 * graceful degradation bei fremden/Homebrew-Dokumenten.
 */
import { z } from 'zod';
import {
  sourceField,
  migrateSourceLegacy,
  proficiencyGrantSchema,
  skillGrantSchema,
  emptyProficiencyGrant,
  emptySkillGrant,
  type AbilityName,
} from './shared';

/** App-Attribut-Schlüssel (dex→ges, wis→wei). */
export const ABILITY_KEYS = ['str', 'ges', 'kon', 'int', 'wei', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

/**
 * App-Attributsschlüssel → englischer SRD-Name. Gegenstück zu `ABILITY_FROM_EN`
 * (services/classProgression.ts, dort re-exportiert). Steht hier, weil die
 * Altdaten-Migration unten sie braucht.
 */
export const ABILITY_TO_EN: Record<AbilityKey, AbilityName> = {
  str: 'Strength', ges: 'Dexterity', kon: 'Constitution',
  int: 'Intelligence', wei: 'Wisdom', cha: 'Charisma',
};

/** Eine Stufe: alle Tabellenspalten offen als name→Wert (Rohwert wie in v2). */
export const classLevelSchema = z.object({
  level: z.number().int().min(1).max(20),
  columns: z.record(z.string(), z.string()).default({}),
});

/** Ein Klassenmerkmal; `gainedAt` kann mehrere Stufen enthalten (z.B. ASI 4/8/12/16). */
export const classFeatureSchema = z.object({
  key: z.string().default(''),
  name: z.string(),
  nameDe: z.string().optional(),
  gainedAt: z.array(z.number().int()).default([]),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  featureType: z.string().optional(),
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
  /**
   * Die Kerntabelle („Core Traits") in strukturierter Form: Fertigkeiten,
   * Rettungswürfe, Waffen, Rüstung — ENGLISCHE Enum-Werte (siehe shared.ts).
   * Bei Subklassen leer; die Kerntabelle hängt an der Grundklasse.
   */
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  /**
   * Was diese Klasse gewährt, wenn sie als ZWEITE (Multiclass-)Klasse dazukommt.
   * Steht NICHT in Open5e v2 (nur im SRD-Abschnitt „Als Charakter mit
   * Klassenkombination") — wird im Vault gepflegt und beim Re-Import erhalten.
   * Nur Barde/Schurke/Waldläufer gewähren hier eine Fertigkeit, die übrigen neun nichts.
   */
  skillGrantMulticlass: skillGrantSchema.default(emptySkillGrant),
  /**
   * Anfangsausrüstung als Prosa — `inventory[]` kennt nur freie Namen, ein Grant hätte kein Ziel.
   * Zweisprachig wie die Hintergrund-Vorteile: die ENGLISCHE Fassung geht als
   * `<class_equipment>` in den Wizard-Prompt, die deutsche ist reine Anzeige
   * (ClassCard) und darf fehlen — dann zeigt die Karte die englische.
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
 * Altformat: `savingThrows: ['kon','str']` (deutsche App-Schlüssel) am Klassenkopf
 * → `proficiencyGrant.savingThrows: ['Constitution','Strength']` (englische Namen).
 * Bis Juli 2026 trugen alle Klassendateien die deutsche Form; seither ist die
 * Grundmechanik durchgehend englisch (siehe „Geschlossene Regel-Vokabulare",
 * shared.ts). Das Feld wird beim Migrieren entfernt, damit keine zweite Wahrheit
 * zurückbleibt.
 */
export function migrateClassLegacy(raw: unknown): Record<string, unknown> {
  const obj = migrateSourceLegacy(raw as Record<string, unknown>);
  const legacy = obj.savingThrows;
  delete obj.savingThrows;
  if (!Array.isArray(legacy) || !legacy.length) return obj;

  const grant = (obj.proficiencyGrant ?? {}) as Record<string, unknown>;
  if (!Array.isArray(grant.savingThrows) || !grant.savingThrows.length) {
    grant.savingThrows = legacy
      .map((k) => ABILITY_TO_EN[k as AbilityKey])
      .filter((n): n is AbilityName => Boolean(n));
    obj.proficiencyGrant = grant;
  }
  return obj;
}

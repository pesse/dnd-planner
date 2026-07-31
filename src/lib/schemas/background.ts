/**
 * Zweisprachiges Hintergrund-Bibliotheks-Schema — analog zu Spezies
 * (`species.ts`): ein Kopf plus eine Liste zweisprachiger Unter-Einträge.
 *
 * Ein dünner Adapter über das Open5e-**v2**-Format (`/v2/backgrounds/{key}`).
 * Die Vorteile (`benefits`) tragen — wie die Spezies-Merkmale — je einen
 * englischen (`name`/`desc`) und einen optionalen deutschen (`nameDe`/`descDe`)
 * Wert; das Deutsche wird per LLM-Übersetzung nachgefüllt.
 *
 * `abilityScores` und `featKey` sind bewusst redundant zu den entsprechenden
 * `benefits`-Einträgen: die Liste ist die Anzeige- und Übersetzungsebene, die
 * beiden Felder sind die maschinell nutzbare Mechanik (Attributssteigerungen und
 * der Link auf das Herkunftstalent in `vault/feats`).
 */
import { z } from 'zod';
import { sourceField } from './source';
import { proficiencyGrantSchema, emptyProficiencyGrant } from './grants';

/** Vokabular der Vorteils-Arten — entspricht Open5es `benefits[].type`. */
export const BENEFIT_TYPES = [
  'ability_score',
  'skill_proficiency',
  'tool_proficiency',
  'feat',
  'equipment',
  'other',
] as const;

export type BenefitType = (typeof BENEFIT_TYPES)[number];

/** Deutsche Anzeige-Labels der Vorteils-Arten (Reihenfolge = Anzeige-Reihenfolge). */
export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  ability_score: 'Attributswerte',
  skill_proficiency: 'Fertigkeiten',
  tool_proficiency: 'Werkzeugübung',
  feat: 'Herkunftstalent',
  equipment: 'Ausrüstung',
  other: 'Weiteres',
};

/** Ein einzelner Vorteil eines Hintergrunds; zweisprachig (EN Pflicht, DE optional). */
export const benefitSchema = z.object({
  key: z.string().default(''),
  type: z.enum(BENEFIT_TYPES).default('other').describe('Art des Vorteils (Open5e-Vokabular).'),
  name: z.string(),
  nameDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
});

export const backgroundSchema = z.object({
  key: z.string(),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  abilityScores: z
    .array(z.string())
    .default([])
    .describe('Englische Attributsnamen, z.B. ["Strength","Dexterity","Constitution"].'),
  featKey: z
    .string()
    .default('')
    .describe('Bibliotheks-Key des Herkunftstalents, z.B. "srd-2024_savage-attacker".'),
  /**
   * Die Fertigkeitsübungen als Mechanik (englische Enum-Werte) — abgeleitet aus dem
   * `skill_proficiency`-Vorteil. Alle 16 SRD-Hintergründe gewähren genau zwei FESTE
   * Fertigkeiten. Dieselbe bewusste Redundanz wie `abilityScores`/`featKey`: die
   * `benefits`-Liste ist die Anzeigeebene, dies hier die maschinell nutzbare Form.
   * Werkzeugübungen bleiben Prosa im Vorteil (Werkzeuge sind kein Vokabular der App).
   */
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
  benefits: z.array(benefitSchema).default([]),
});

export type Benefit = z.infer<typeof benefitSchema>;
export type Background = z.infer<typeof backgroundSchema>;

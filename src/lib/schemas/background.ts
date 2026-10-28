/**
 * Adapter über Open5e v2 (`/v2/backgrounds/{key}`), zweisprachig wie `species.ts`.
 * `abilityScores`/`featKey`/`proficiencyGrant` sind bewusst redundant zu `benefits`:
 * die Liste ist Anzeige- und Übersetzungsebene, die Felder die nutzbare Mechanik.
 */
import { z } from 'zod';
import { sourceField } from './source';
import { proficiencyGrantSchema, emptyProficiencyGrant } from './grants';
import { startingEquipmentOptionSchema } from './startingEquipment';
import { featureDeclarationFields } from './featureChoice';

/** Entspricht Open5es `benefits[].type`. */
export const BENEFIT_TYPES = [
  'ability_score',
  'skill_proficiency',
  'tool_proficiency',
  'feat',
  'equipment',
  'other',
] as const;

export type BenefitType = (typeof BENEFIT_TYPES)[number];

/** Reihenfolge = Anzeige-Reihenfolge. */
export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  ability_score: 'Attributswerte',
  skill_proficiency: 'Fertigkeiten',
  tool_proficiency: 'Werkzeugübung',
  feat: 'Herkunftstalent',
  equipment: 'Ausrüstung',
  other: 'Weiteres',
};

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
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  grantsChoice: featureDeclarationFields.grantsChoice.describe(
    'Wahl, die der Hintergrund selbst gewährt — „Wähle eine Art von Spielset aus" als kind="toolProficiency".',
  ),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
  benefits: z.array(benefitSchema).default([]),
  startingEquipmentOptions: z.array(startingEquipmentOptionSchema).optional(),
});

export type Benefit = z.infer<typeof benefitSchema>;
export type Background = z.infer<typeof backgroundSchema>;

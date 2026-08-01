/**
 * Adapter über Open5e v2 (`/v2/feats/{key}`), zweisprachig wie Klasse und Spezies.
 * `featsLibrary.ts` liest dieselbe `vault/feats`-Sammlung und nutzt `key` als
 * `sourceKey` der Charakter-Referenz — beide Leser müssen zusammenpassen.
 */
import { z } from 'zod';
import { sourceField, migrateSourceLegacy } from './source';
import { featureDeclarationFields } from './featureChoice';
import { foldLegacyProficiencyGrant } from './grants';
import { FEAT_CATEGORIES } from './vocabulary';

export const featSchema = z.object({
  key: z.string().default(''),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  /**
   * Default `General`, weil ein selbst erfundenes Talent ohne weitere Angabe genau das
   * ist — die drei anderen Kategorien hängen an einer Bedingung in `prerequisite`.
   */
  category: z.enum(FEAT_CATEGORIES).default('General').describe('Wann das Talent genommen werden darf.'),
  prerequisite: z.string().default(''),
  prerequisiteDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  // Im SRD 5.2 trägt nur `srd-2024_magic-initiate` eine Wahl (`kind: "spellAccess"`) und nur
  // `srd-2024_skilled` Übungen: dessen „three skills or tools" ist `{choose: 3, from: []}`,
  // denn dass auch WERKZEUGE zulässig sind, kann `skillGrant` nicht ausdrücken.
  ...featureDeclarationFields,
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
});

export type Feat = z.infer<typeof featSchema>;

/** Altformat: `proficiencyGrant` → `grants.proficiencies` (siehe `migrateSpeciesLegacy`). */
export function migrateFeatLegacy(raw: unknown): Record<string, unknown> {
  return foldLegacyProficiencyGrant(migrateSourceLegacy(raw as Record<string, unknown>));
}

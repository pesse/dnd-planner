/**
 * Zweisprachiges Talent-(Feat-)Bibliotheks-Schema — analog zu Klasse/Spezies.
 *
 * Ein dünner Adapter über das Open5e-**v2**-Format (`/v2/feats/{key}`), zweisprachig
 * (EN Pflicht, DE optional). Kompatibel zum leichten Inline-Wörterbuch
 * (`featsLibrary.ts`), das dieselbe `vault/feats`-Sammlung liest (dort wird `key` als
 * `sourceKey` der Charakter-Referenz genutzt).
 */
import { z } from 'zod';
import { sourceField, proficiencyGrantSchema, emptyProficiencyGrant, FEAT_CATEGORIES } from './shared';

export const featSchema = z.object({
  key: z.string().default(''),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  /**
   * Talent-Kategorie (Open5e: `type`). Default `General`, weil ein selbst erfundenes
   * Talent ohne weitere Angabe genau das ist — die drei anderen Kategorien hängen an
   * einer Bedingung, die dann in `prerequisite` stehen müsste.
   */
  category: z.enum(FEAT_CATEGORIES).default('General').describe('Wann das Talent genommen werden darf.'),
  prerequisite: z.string().default(''),
  prerequisiteDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  /**
   * Übungen, die das Talent gewährt (englische Enum-Werte). Im SRD 5.2 betrifft das
   * nur `srd-2024_skilled`. Dessen „any combination of three skills or tools" ist
   * bewusst als `{choose: 3, from: []}` abgebildet — dass auch WERKZEUGE zulässig
   * sind, kann `skillGrant` nicht ausdrücken und bleibt der Prosa überlassen.
   */
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
});

export type Feat = z.infer<typeof featSchema>;

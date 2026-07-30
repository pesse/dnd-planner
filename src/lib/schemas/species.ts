/**
 * Zweisprachiges Spezies-Bibliotheks-Schema — analog zur Klassen-Progression
 * (`classProgression.ts`), aber ohne Stufen-Konzept.
 *
 * Ein dünner Adapter über das Open5e-**v2**-Format (`/v2/species/{key}`): die
 * Merkmale (`traits`) tragen — wie bei Zaubern/Gegenständen — je einen englischen
 * (`name`/`desc`) und einen optionalen deutschen (`nameDe`/`descDe`) Wert. Das
 * Deutsche wird per LLM-Übersetzung nachgefüllt; Open5e liefert nur Englisch.
 */
import { z } from 'zod';
import {
  sourceField,
  proficiencyGrantSchema,
  emptyProficiencyGrant,
  featureChoiceGrantSchema,
  featureGrantSchema,
} from './shared';

/**
 * Merkmale, deren ganzer Inhalt ein Wert ist, den der Bogen in einem eigenen Feld führt —
 * nichts zu deuten. Diskriminator, nicht Namensregel: fehlt er, bleibt das Merkmal bei der
 * KI. Deshalb tragen Mensch und Tiefling ihn NICHT, ihre Größe ist eine Wahl.
 */
export const SHEET_VALUE_TRAITS = ['size', 'speed'] as const;
export type SheetValueTrait = (typeof SHEET_VALUE_TRAITS)[number];

/**
 * Ein Speziesmerkmal (Trait); zweisprachig (EN Pflicht, DE optional).
 *
 * Der Grant hängt am MERKMAL, nicht an der Spezies: im SRD 5.2 gewähren nur zwei
 * Merkmale eine Fertigkeit (Elf „Keen Senses", Mensch „Skillful"), und beide sind
 * eine Wahl. Für alles Übrige bleibt er leer.
 */
export const traitSchema = z.object({
  key: z.string().default(''),
  name: z.string(),
  nameDe: z.string().optional(),
  desc: z.string().default(''),
  descDe: z.string().optional(),
  proficiencyGrant: proficiencyGrantSchema.default(emptyProficiencyGrant),
  sheetValue: z.enum(SHEET_VALUE_TRAITS).optional().describe('Reiner Bogenwert — geht nicht in die Deutung.'),
  /**
   * Deklariert eine Wahl, die dieses Merkmal gewährt (`featureChoiceGrantSchema`, shared.ts) —
   * am Trait tragen `optionList` (Zweigwahl mit Konsequenz je Option) und `expertise`.
   * Wie `grants` optional OHNE Default: fehlt das Feld, ist das Merkmal nicht redigiert und
   * seine Wahl bleibt bei der KI-Kette.
   *
   * Die Abstammungen (Gnom, Elf, Drache) sind bewusst NICHT redigiert — sie tragen eine zweite
   * Wahl in derselben Prosa bzw. speisen den Text anderer Merkmale (Korrektur 5 in
   * docs/plan-wahlen-deklarieren.md).
   */
  grantsChoice: featureChoiceGrantSchema.optional(),
  /**
   * Deterministisch anwendbare Mechanik des Merkmals (`featureGrantSchema`, shared.ts).
   * FEHLT das Feld, ist das Merkmal nicht redigiert; `{}` heißt „geprüft, gewährt nichts".
   * `proficiencyGrant` daneben bleibt die Übungs-Senke (eine Form für alle vier Artefakttypen).
   */
  grants: featureGrantSchema.optional(),
});

export const speciesSchema = z.object({
  key: z.string(),
  source: sourceField(),
  name: z.string(),
  nameDe: z.string().optional(),
  size: z.string().default(''),
  speed: z.string().default(''),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
  traits: z.array(traitSchema).default([]),
});

export type Trait = z.infer<typeof traitSchema>;
export type Species = z.infer<typeof speciesSchema>;

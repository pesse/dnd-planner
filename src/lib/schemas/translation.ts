/**
 * EN→DE-Übersetzungs-Ergebnisse, eine Form je Artefakt-Typ (ein gemeinsames Schema
 * presste dem Zauber ein `name_de` und dem Gegenstand Zeit-Felder ab). Jedes Feld hat
 * einen Default, also gilt **leer = war nicht im Input** — die Karten überschreiben nur
 * bei nicht-leerem Wert, sonst verlöre ein Zauber ohne Material sein Feld.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './llmJson';

const SAME_LENGTH = 'Same length and order as the corresponding input array; [] if that array was not in the input.';
const ONLY_IF_PRESENT = '"" if that field was not in the input.';

export const itemTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German item name. ${ONLY_IF_PRESENT}`),
  desc_de: z.array(z.string()).default([]).describe(`German description paragraphs. ${SAME_LENGTH}`),
});

// Ohne Namen: der deutsche Zaubername wird nicht über diesen Pfad gepflegt.
export const spellTranslationSchema = z.object({
  desc_de: z.array(z.string()).default([]).describe(`German description paragraphs. ${SAME_LENGTH}`),
  higher_level_de: z.array(z.string()).default([]).describe(`German "at higher levels" paragraphs. ${SAME_LENGTH}`),
  materials_needed: z.string().default('').describe(`German material component text. ${ONLY_IF_PRESENT}`),
  casting_time: z.string().default('').describe(`German casting time, e.g. "1 Aktion". ${ONLY_IF_PRESENT}`),
  range: z.string().default('').describe(`German range, metric units. ${ONLY_IF_PRESENT}`),
  duration: z.string().default('').describe(`German duration, e.g. "Konzentration, bis zu 1 Minute". ${ONLY_IF_PRESENT}`),
});

// Übersetzung „in place": dieselben Schlüssel wie im Input, nur deutscher Inhalt.
const monsterEntryTranslationSchema = z.object({
  name: z.string().default('').describe('German name of the trait/action.'),
  desc: z.string().default('').describe('German rules text of the trait/action.'),
});

// Schadensarten und Zustände fehlen bewusst: sie sind englische Vokabular-Schlüssel, deren
// deutsche Labels aus `schemas/vocabulary.ts` kommen — übersetzt würden sie unlesbar.
export const monsterTranslationSchema = z.object({
  name: z.string().default('').describe(`German monster name. ${ONLY_IF_PRESENT}`),
  armor_detail: z.string().default('').describe(`German armor detail, e.g. "natürliche Rüstung". ${ONLY_IF_PRESENT}`),
  languages: z.array(z.string()).default([]).describe(`German language names. ${SAME_LENGTH}`),
  languages_desc: z.string().default('').describe(`German extra language note. ${ONLY_IF_PRESENT}`),
  defenses_desc: z.string().default('').describe(`German note on resistances/immunities. ${ONLY_IF_PRESENT}`),
  traits: z.array(monsterEntryTranslationSchema).default([]).describe(`German traits. ${SAME_LENGTH}`),
  actions: z.array(monsterEntryTranslationSchema).default([]).describe(`German actions. ${SAME_LENGTH}`),
});

// Eine Form für Klasse UND Spezies: beide Merkmalsarten sind dasselbe `{name, desc}`-Paar
// (die Spezies-Karte reicht ihre `traits` als `features` ein).
const ruleFeatureTranslationSchema = z.object({
  nameDe: z.string().default('').describe('German feature/trait name.'),
  descDe: z.string().default('').describe('German feature/trait description.'),
});

export const ruleTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German class/species name. ${ONLY_IF_PRESENT}`),
  features: z.array(ruleFeatureTranslationSchema).default([]).describe(`Translated features/traits. ${SAME_LENGTH}`),
});

export const featTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German feat name. ${ONLY_IF_PRESENT}`),
  prerequisite_de: z.string().default('').describe(`German prerequisite. ${ONLY_IF_PRESENT}`),
  desc_de: z.string().default('').describe(`German feat description. ${ONLY_IF_PRESENT}`),
});

const backgroundBenefitTranslationSchema = z.object({
  nameDe: z.string().default('').describe('German benefit name.'),
  descDe: z.string().default('').describe('German benefit text.'),
});

export const backgroundTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German background name. ${ONLY_IF_PRESENT}`),
  desc_de: z.string().default('').describe(`German background description. ${ONLY_IF_PRESENT}`),
  benefits: z.array(backgroundBenefitTranslationSchema).default([]).describe(`Translated benefits. ${SAME_LENGTH}`),
});

export type ItemTranslation = z.infer<typeof itemTranslationSchema>;
export type SpellTranslation = z.infer<typeof spellTranslationSchema>;
export type MonsterTranslation = z.infer<typeof monsterTranslationSchema>;
export type RuleTranslation = z.infer<typeof ruleTranslationSchema>;
export type FeatTranslation = z.infer<typeof featTranslationSchema>;
export type BackgroundTranslation = z.infer<typeof backgroundTranslationSchema>;

export const itemTranslationJsonSchema = toLlmJsonSchema(itemTranslationSchema);
export const spellTranslationJsonSchema = toLlmJsonSchema(spellTranslationSchema);
export const monsterTranslationJsonSchema = toLlmJsonSchema(monsterTranslationSchema);
export const ruleTranslationJsonSchema = toLlmJsonSchema(ruleTranslationSchema);
export const featTranslationJsonSchema = toLlmJsonSchema(featTranslationSchema);
export const backgroundTranslationJsonSchema = toLlmJsonSchema(backgroundTranslationSchema);

const lenient =
  <S extends z.ZodType>(schema: S) =>
  (data: unknown): z.output<S> | null => {
    const r = schema.safeParse(data);
    return r.success ? r.data : null;
  };

export const parseItemTranslation = lenient(itemTranslationSchema);
export const parseSpellTranslation = lenient(spellTranslationSchema);
export const parseMonsterTranslation = lenient(monsterTranslationSchema);
export const parseRuleTranslation = lenient(ruleTranslationSchema);
export const parseFeatTranslation = lenient(featTranslationSchema);
export const parseBackgroundTranslation = lenient(backgroundTranslationSchema);

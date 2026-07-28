/**
 * Zod-Schemas der EN→DE-Übersetzungs-Ergebnisse — eine Form je Artefakt-Typ.
 *
 * Vorher stand das Ausgabeformat nur als Prosa im Prompt (`<output_format>`) und jede
 * Karte hat den Rohtext selbst per Regex geparst. Hier ist es ein Schema: Guided
 * Decoding erzwingt es serverseitig (auf QM zusätzlich mit abgeschaltetem Thinking),
 * `parse…()` validiert es, und die Karten bekommen ein typisiertes Objekt.
 *
 * Konvention wie in `levelUp.ts`: JEDES Feld hat einen Default, `toLlmJsonSchema`
 * (`io: 'output'`) macht daraus ein striktes Schema mit lauter `required`-Feldern —
 * genau das, was guided decoding braucht. Semantik daher:
 *
 *   **leer ("" bzw. []) = das Feld war nicht im Input / wurde nicht übersetzt.**
 *
 * Die Karten überschreiben deshalb nur bei nicht-leerem Wert (ein Zauber ohne
 * materielle Komponente darf sein Feld nicht mit "" verlieren).
 *
 * Item und Zauber haben BEWUSST getrennte Schemas, obwohl sie früher denselben
 * Prompt teilten: unter guided decoding ist jedes Feld Pflicht, und ein gemeinsames
 * Schema würde dem Zauber ein `name_de` und dem Gegenstand Zeit-/Reichweiten-Felder
 * abpressen, die es dort nicht gibt.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './shared';

const SAME_LENGTH = 'Same length and order as the corresponding input array; [] if that array was not in the input.';
const ONLY_IF_PRESENT = '"" if that field was not in the input.';

// ── Gegenstand ────────────────────────────────────────────────────────────────
export const itemTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German item name. ${ONLY_IF_PRESENT}`),
  desc_de: z.array(z.string()).default([]).describe(`German description paragraphs. ${SAME_LENGTH}`),
});

// ── Zauber ────────────────────────────────────────────────────────────────────
// Ohne Namen: der deutsche Zaubername wird nicht über diesen Pfad gepflegt.
export const spellTranslationSchema = z.object({
  desc_de: z.array(z.string()).default([]).describe(`German description paragraphs. ${SAME_LENGTH}`),
  higher_level_de: z.array(z.string()).default([]).describe(`German "at higher levels" paragraphs. ${SAME_LENGTH}`),
  materials_needed: z.string().default('').describe(`German material component text. ${ONLY_IF_PRESENT}`),
  casting_time: z.string().default('').describe(`German casting time, e.g. "1 Aktion". ${ONLY_IF_PRESENT}`),
  range: z.string().default('').describe(`German range, metric units. ${ONLY_IF_PRESENT}`),
  duration: z.string().default('').describe(`German duration, e.g. "Konzentration, bis zu 1 Minute". ${ONLY_IF_PRESENT}`),
});

// ── Monster ───────────────────────────────────────────────────────────────────
// Übersetzung „in place": dieselben Schlüssel wie im Input, nur deutscher Inhalt.
const monsterEntryTranslationSchema = z.object({
  name: z.string().default('').describe('German name of the trait/action.'),
  description: z.string().default('').describe('German rules text of the trait/action.'),
});

export const monsterTranslationSchema = z.object({
  name: z.string().default('').describe(`German monster name. ${ONLY_IF_PRESENT}`),
  languages: z.string().default('').describe(`German languages line. ${ONLY_IF_PRESENT}`),
  damage_resistances: z.array(z.string()).default([]).describe(`German damage resistances. ${SAME_LENGTH}`),
  damage_immunities: z.array(z.string()).default([]).describe(`German damage immunities. ${SAME_LENGTH}`),
  condition_immunities: z.array(z.string()).default([]).describe(`German condition immunities. ${SAME_LENGTH}`),
  traits: z.array(monsterEntryTranslationSchema).default([]).describe(`German traits. ${SAME_LENGTH}`),
  actions: z.array(monsterEntryTranslationSchema).default([]).describe(`German actions. ${SAME_LENGTH}`),
  reactions: z.array(monsterEntryTranslationSchema).default([]).describe(`German reactions. ${SAME_LENGTH}`),
  legendary_actions: z.array(monsterEntryTranslationSchema).default([]).describe(`German legendary actions. ${SAME_LENGTH}`),
});

// ── Klasse / Spezies ──────────────────────────────────────────────────────────
// Eine Form für beide: Klassenmerkmale und Spezies-Merkmale sind dasselbe
// `{name, desc}`-Paar (die Spezies-Karte reicht ihre `traits` als `features` ein).
const ruleFeatureTranslationSchema = z.object({
  nameDe: z.string().default('').describe('German feature/trait name.'),
  descDe: z.string().default('').describe('German feature/trait description.'),
});

export const ruleTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German class/species name. ${ONLY_IF_PRESENT}`),
  features: z.array(ruleFeatureTranslationSchema).default([]).describe(`Translated features/traits. ${SAME_LENGTH}`),
});

// ── Talent ────────────────────────────────────────────────────────────────────
export const featTranslationSchema = z.object({
  name_de: z.string().default('').describe(`German feat name. ${ONLY_IF_PRESENT}`),
  prerequisite_de: z.string().default('').describe(`German prerequisite. ${ONLY_IF_PRESENT}`),
  desc_de: z.string().default('').describe(`German feat description. ${ONLY_IF_PRESENT}`),
});

// ── Hintergrund ───────────────────────────────────────────────────────────────
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

/** Nachsichtige Guards: parsen + Defaults füllen; null bei Schema-Verstoß. */
export function parseItemTranslation(data: unknown): ItemTranslation | null {
  const r = itemTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseSpellTranslation(data: unknown): SpellTranslation | null {
  const r = spellTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseMonsterTranslation(data: unknown): MonsterTranslation | null {
  const r = monsterTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseRuleTranslation(data: unknown): RuleTranslation | null {
  const r = ruleTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseFeatTranslation(data: unknown): FeatTranslation | null {
  const r = featTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseBackgroundTranslation(data: unknown): BackgroundTranslation | null {
  const r = backgroundTranslationSchema.safeParse(data);
  return r.success ? r.data : null;
}

/**
 * EN→DE-Übersetzung der Bibliotheks-Artefakte: das Gerüst (Intro, Glossar-Pins,
 * Ausgabe-Regeln) steht einmal hier, je Artefakt-Typ bleiben Schema + Input-Beschreibung.
 *
 * Bewusst TOOL-FREI — sonst fährt `runAiAction` einen Agent-Loop statt eines Calls.
 */
import { buildTerminologyBlock } from '../glossary';
import {
  backgroundTranslationJsonSchema,
  featTranslationJsonSchema,
  itemTranslationJsonSchema,
  monsterTranslationJsonSchema,
  parseBackgroundTranslation,
  parseFeatTranslation,
  parseItemTranslation,
  parseMonsterTranslation,
  parseRuleTranslation,
  parseSpellTranslation,
  ruleTranslationJsonSchema,
  spellTranslationJsonSchema,
  type BackgroundTranslation,
  type FeatTranslation,
  type ItemTranslation,
  type MonsterTranslation,
  type RuleTranslation,
  type SpellTranslation,
} from '../../schemas/translation';
import type { AiAction } from './types';

/** Was eine Übersetzung pro Artefakt-Typ unterscheidet — der Rest ist gemeinsames Gerüst. */
export interface TranslationSpec<T> {
  entity: string; // 'item' | 'spell' | 'rule' | …
  nounDe: string; // fürs Label: „Gegenstand übersetzen"
  jsonSchema: object;
  validate: (data: unknown) => data is T;
  instructions: string; // Input-Beschreibung + typ-eigene Regeln, englisch, XML-gegliedert
}

export interface TranslationRun<T> {
  action: AiAction<T>;
  input: string;
}

const TRANSLATOR_INTRO =
  'You are a D&D translator. You translate the given fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1). ' +
  'Translate the RULES TEXT only — never answer, comment, summarise or shorten it.';

/**
 * Nur was Guided Decoding nicht kann: Array-Längen an den Input koppeln. Die Karten
 * schreiben über den Index zurück (`MonsterCard.applyTranslation`) — ein verschlucktes
 * Element verschiebt alle folgenden Namen auf die falsche Aktion.
 */
const OUTPUT_RULES = `<output_rules>
- Arrays keep the length and order of their input counterpart — one translated element per input element, no merging and no splitting.
- A field with no counterpart in <source_en> stays empty ("" / []) rather than invented, and English text is never passed through untranslated.
</output_rules>`;

/**
 * Der System-Prompt entsteht pro LAUF, nicht pro Aktion: `buildTerminologyBlock` filtert
 * das Glossar auf die im Payload vorkommenden Begriffe.
 */
export function buildTranslationRun<T>(
  spec: TranslationSpec<T>,
  payload: Record<string, unknown>,
): TranslationRun<T> {
  const sourceEn = JSON.stringify(payload, null, 2);
  return {
    input: `<source_en>\n${sourceEn}\n</source_en>`,
    action: {
      id: `translate-${spec.entity}`,
      label: `${spec.nounDe} übersetzen`,
      anthropicTools: [],
      openAiTools: [],
      execute: async () => '',
      jsonSchema: spec.jsonSchema,
      validate: spec.validate,
      buildSystemPrompt: () =>
        [TRANSLATOR_INTRO, spec.instructions, buildTerminologyBlock(sourceEn), OUTPUT_RULES]
          .filter(Boolean)
          .join('\n\n'),
    },
  };
}

// ── Specs ─────────────────────────────────────────────────────────────────────

const itemSpec: TranslationSpec<ItemTranslation> = {
  entity: 'item',
  nounDe: 'Gegenstand',
  jsonSchema: itemTranslationJsonSchema,
  validate: (d): d is ItemTranslation => parseItemTranslation(d) !== null,
  instructions: `<input_format>
JSON with any of these optional fields:
- "name": string (the item name)
- "desc": array of strings (description paragraphs)
</input_format>`,
};

const spellSpec: TranslationSpec<SpellTranslation> = {
  entity: 'spell',
  nounDe: 'Zauber',
  jsonSchema: spellTranslationJsonSchema,
  validate: (d): d is SpellTranslation => parseSpellTranslation(d) !== null,
  instructions: `<input_format>
JSON with any of these optional fields:
- "desc": array of strings (description paragraphs)
- "higher_level": array of strings (upcast description)
- "materials_needed": string (material component description)
- "casting_time": string (e.g. "1 action", "1 bonus action")
- "range": string (e.g. "150 feet", "Self (20-foot-radius sphere)")
- "duration": string (e.g. "Instantaneous", "Concentration, up to 1 minute")
</input_format>
<rules>
- "materials_needed", "casting_time", "range" and "duration" are translated IN PLACE — the output field keeps the same name.
</rules>`,
};

const monsterSpec: TranslationSpec<MonsterTranslation> = {
  entity: 'monster',
  nounDe: 'Monster',
  jsonSchema: monsterTranslationJsonSchema,
  validate: (d): d is MonsterTranslation => parseMonsterTranslation(d) !== null,
  instructions: `<input_format>
JSON with any of these optional fields:
- "name": string
- "languages": string
- "damage_resistances", "damage_immunities", "condition_immunities": arrays of strings
- "traits", "actions", "reactions", "legendary_actions": arrays of objects with "name" and "description"
</input_format>
<rules>
- Every field is translated IN PLACE: the output keeps the exact same keys and structure, only the text becomes German.
</rules>`,
};

const ruleSpec: TranslationSpec<RuleTranslation> = {
  entity: 'rule',
  nounDe: 'Klasse/Spezies',
  jsonSchema: ruleTranslationJsonSchema,
  validate: (d): d is RuleTranslation => parseRuleTranslation(d) !== null,
  instructions: `<input_format>
JSON with these fields:
- "name": string (the class or species name, optional)
- "features": array of objects, each with "name" and "desc" (class features or species traits)
</input_format>`,
};

const featSpec: TranslationSpec<FeatTranslation> = {
  entity: 'feat',
  nounDe: 'Talent',
  jsonSchema: featTranslationJsonSchema,
  validate: (d): d is FeatTranslation => parseFeatTranslation(d) !== null,
  instructions: `<input_format>
JSON with any of these optional fields:
- "name": string (feat name)
- "prerequisite": string (feat prerequisite)
- "desc": string (feat description)
</input_format>`,
};

const backgroundSpec: TranslationSpec<BackgroundTranslation> = {
  entity: 'background',
  nounDe: 'Hintergrund',
  jsonSchema: backgroundTranslationJsonSchema,
  validate: (d): d is BackgroundTranslation => parseBackgroundTranslation(d) !== null,
  instructions: `<input_format>
JSON with these fields:
- "name": string (the background name, optional)
- "desc": string (the background description, optional)
- "benefits": array of objects, each with "name" and "desc". These are the mechanical benefits of
  the background: ability scores, skill proficiencies, tool proficiency, origin feat, starting equipment.
</input_format>
<rules>
- Ability names, skill names, tool names and feat names are rules terms: use the established German
  equivalents (Stärke, Geschicklichkeit, Konstitution, Intelligenz, Weisheit, Charisma; Athletik,
  Heimlichkeit, Religion, …).
- Keep the "Choose A or B:" structure of equipment lists and the Markdown emphasis intact.
- Convert coin abbreviations: GP → GM, SP → SM, CP → KM.
</rules>`,
};

// ── Öffentliche API (eine Zeile je Artefakt-Typ) ───────────────────────────────

/** „Gegenstand übersetzen" — Payload: `{ name?, desc? }`. */
export const translateItem = (payload: Record<string, unknown>) => buildTranslationRun(itemSpec, payload);
/** „Zauber übersetzen" — Payload: `{ desc?, higher_level?, materials_needed?, casting_time?, range?, duration? }`. */
export const translateSpell = (payload: Record<string, unknown>) => buildTranslationRun(spellSpec, payload);
/** „Monster übersetzen" — Payload: Statblock-Textfelder, in place. */
export const translateMonster = (payload: Record<string, unknown>) => buildTranslationRun(monsterSpec, payload);
/** „Klasse/Spezies übersetzen" — Payload: `{ name?, features: [{name, desc}] }` (Spezies reicht ihre `traits` als `features` ein). */
export const translateRule = (payload: Record<string, unknown>) => buildTranslationRun(ruleSpec, payload);
/** „Talent übersetzen" — Payload: `{ name?, prerequisite?, desc? }`. */
export const translateFeat = (payload: Record<string, unknown>) => buildTranslationRun(featSpec, payload);
/** „Hintergrund übersetzen" — Payload: `{ name?, desc?, benefits: [{name, desc}] }`. */
export const translateBackground = (payload: Record<string, unknown>) => buildTranslationRun(backgroundSpec, payload);

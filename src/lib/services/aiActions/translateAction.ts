/**
 * KI-Aktionen für die EN→DE-Übersetzung der Bibliotheks-Artefakte.
 *
 * Ersetzt den früheren Rohtext-Pfad (`prompts.ts` + `client.generate` + Regex-Parser in
 * jeder Karte) nach dem Vorbild von `featureEffectsAction`: das Ergebnis-Format ist ein
 * Zod-Schema (`schemas/translation.ts`), das der Provider serverseitig erzwingt — auf
 * QM/vllm über `structured_outputs` samt `enable_thinking:false`, sodass kein Reasoning
 * mehr im Feld landet.
 *
 * Bewusst TOOL-FREI: `runAiAction` fährt damit einen einzigen Call (kein Agent-Loop) und
 * nimmt automatisch den besten Pfad je Provider — Anthropic/QM nativ schema-valide,
 * Groq/Ollama emuliert per JSON-Block.
 *
 * Aufbauprinzip wie bei `spec.ts`/`factory.ts`: das Gerüst (Intro, Glossar-Pins,
 * Leerfeld-Regel, AiAction-Boilerplate) steht einmal hier, je Artefakt-Typ bleiben nur
 * Schema + Input-Beschreibung. Anweisungen ENGLISCH, Sektionen XML-gegliedert; deutsch
 * ist nur, was der Nutzer am Ende sieht.
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
  /** Stabile Kurz-ID, z.B. 'item' | 'spell' | 'rule'. */
  entity: string;
  /** Deutsches Substantiv fürs Label, z.B. 'Gegenstand'. */
  nounDe: string;
  /** LLM-JSON-Schema des Ergebnisses (aus schemas/translation.ts). */
  jsonSchema: object;
  /** Laufzeitprüfung des Ergebnisses. */
  validate: (data: unknown) => data is T;
  /** Beschreibung des Inputs + typ-eigene Regeln (englisch, XML-gegliedert). */
  instructions: string;
}

/** Fertiger Übersetzungslauf: die Aktion plus der userInput, auf den sie sich bezieht. */
export interface TranslationRun<T> {
  action: AiAction<T>;
  input: string;
}

const TRANSLATOR_INTRO =
  'You are a D&D translator. You translate the given fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1). ' +
  'Translate the RULES TEXT only — never answer, comment, summarise or shorten it.';

/**
 * Der Preis des erzwungenen Schemas: jedes Feld IST in der Antwort, auch wenn der Input
 * es nicht enthielt. Damit die App ein vorhandenes deutsches Feld nicht gegen "" tauscht,
 * muss „nicht übersetzt" als leerer Wert erkennbar bleiben.
 */
const EMPTY_FIELD_RULE = `<output_rules>
- The output schema is enforced: every field is present in your answer.
- Leave a field EMPTY ("" or []) when the matching field is absent from <source_en>. An empty value means "nothing to translate" — the app keeps whatever it already has.
- Never invent content, never pass the English text through untranslated, never add fields.
- Arrays keep the length and order of their input counterpart — one translated element per input element, no merging and no splitting.
</output_rules>`;

/**
 * Baut aus einer Spec und dem zu übersetzenden Payload den fertigen Lauf.
 *
 * Die Glossar-Pins hängen am konkreten Payload (`buildTerminologyBlock` filtert das
 * 232-Begriffe-Glossar auf die im Quelltext vorkommenden Begriffe und rechnet die
 * Distanzen vor), deshalb wird der System-Prompt pro Lauf gebaut — nicht pro Aktion.
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
        [TRANSLATOR_INTRO, spec.instructions, buildTerminologyBlock(sourceEn), EMPTY_FIELD_RULE]
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

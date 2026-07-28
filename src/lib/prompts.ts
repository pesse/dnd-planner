/**
 * Gemeinsame Prompt-Bausteine für LLM-Übersetzungen.
 *
 * Terminologie kommt NICHT mehr als statische Liste, sondern relevanz-gefiltert
 * aus dem Glossar (`services/glossary`): pro Aufruf werden nur die im Quelltext
 * vorkommenden offiziellen Begriffe + Distanz-Umrechnungen eingehängt. Distanzen
 * werden zusätzlich deterministisch in der Ausgabe nachkonvertiert (in den Cards).
 *
 * Anweisungen englisch ([[feedback_english_system_prompts]]), Sektionen mit
 * XML-Tags gegliedert ([[feedback_prompt_xml_sections]]).
 */
import { buildTerminologyBlock } from './services/glossary';

const TRANSLATION_INTRO =
  'You are a D&D translator. Translate the given fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1).';

const TRANSLATION_IO = `<input_format>
JSON with any of these optional fields:
- "name": string
- "desc": array of strings (description paragraphs)
- "higher_level": array of strings (upcast description)
- "materials_needed": string (material component description)
- "casting_time": string (e.g. "1 action", "1 bonus action")
- "range": string (e.g. "150 feet", "Self (20-foot-radius sphere)")
- "duration": string (e.g. "Instantaneous", "Concentration, up to 1 minute")
</input_format>
<output_format>
JSON with the translated fields — only include fields that were in the input:
- "name_de": string
- "desc_de": array of strings, same length as input "desc"
- "higher_level_de": array of strings, same length as input "higher_level"
- "materials_needed": string, translated in place
- "casting_time": string, translated in place
- "range": string, translated in place
- "duration": string, translated in place
Respond exclusively with valid JSON, no extra text.
</output_format>`;

const MONSTER_INTRO =
  'You are a D&D translator. Translate the given monster fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1).';

const MONSTER_IO = `<input_format>
JSON with any of these optional fields:
- "name": string
- "languages": string
- "damage_resistances", "damage_immunities", "condition_immunities": arrays of strings
- "traits", "actions", "reactions", "legendary_actions": arrays of objects with "name" and "description" fields
</input_format>
<output_format>
JSON with the exact same structure and keys, all text translated to German.
Respond exclusively with valid JSON, no extra text.
</output_format>`;

const RULE_INTRO =
  'You are a D&D translator. Translate the given class/species fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1).';

const RULE_IO = `<input_format>
JSON with these fields:
- "name": string (the class or species name, optional)
- "features": array of objects, each with "name" and "desc" fields (class features or species traits)
</input_format>
<output_format>
JSON with the translated fields:
- "name_de": string (only if "name" was in the input)
- "features": array of objects, EXACTLY the same length and order as the input "features",
  each with "nameDe" (translated feature name) and "descDe" (translated feature description)
Respond exclusively with valid JSON, no extra text.
</output_format>`;

/** System-Prompt für Item-/Zauber-Übersetzung, mit relevanz-gefilterter Terminologie zum Quelltext. */
export function buildTranslationSystemPrompt(sourceEn = ''): string {
  return [TRANSLATION_INTRO, buildTerminologyBlock(sourceEn), TRANSLATION_IO].filter(Boolean).join('\n\n');
}

/** System-Prompt für Klassen-/Spezies-Übersetzung (Array-of-Objects: features/traits). */
export function buildRuleTranslationSystemPrompt(sourceEn = ''): string {
  return [RULE_INTRO, buildTerminologyBlock(sourceEn), RULE_IO].filter(Boolean).join('\n\n');
}

const FEAT_INTRO =
  'You are a D&D translator. Translate the given feat fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1).';

const FEAT_IO = `<input_format>
JSON with any of these optional fields:
- "name": string (feat name)
- "prerequisite": string (feat prerequisite)
- "desc": string (feat description)
</input_format>
<output_format>
JSON with the translated fields — only include fields that were in the input:
- "name_de": string
- "prerequisite_de": string
- "desc_de": string
Respond exclusively with valid JSON, no extra text.
</output_format>`;

/** System-Prompt für Talent-(Feat-)Übersetzung (Einzel-Strings name/prerequisite/desc). */
export function buildFeatTranslationSystemPrompt(sourceEn = ''): string {
  return [FEAT_INTRO, buildTerminologyBlock(sourceEn), FEAT_IO].filter(Boolean).join('\n\n');
}

const BACKGROUND_INTRO =
  'You are a D&D translator. Translate the given background fields from English into German, ' +
  'accurately and true to the style of the official German D&D publications (SRD 5.2.1).';

const BACKGROUND_IO = `<input_format>
JSON with these fields:
- "name": string (the background name, optional)
- "desc": string (the background description, optional)
- "benefits": array of objects, each with "name" and "desc" fields. These are the mechanical
  benefits of the background: ability scores, skill proficiencies, tool proficiency, origin
  feat, starting equipment.
</input_format>
<output_format>
JSON with the translated fields — only include "name_de"/"desc_de" if they were in the input:
- "name_de": string
- "desc_de": string
- "benefits": array of objects, EXACTLY the same length and order as the input "benefits",
  each with "nameDe" (translated benefit name) and "descDe" (translated benefit description)
</output_format>
<rules>
- Ability names, skill names, tool names and feat names are rules terms: use the established
  German equivalents (Stärke, Geschicklichkeit, Konstitution, Intelligenz, Weisheit, Charisma;
  Athletik, Heimlichkeit, Religion, …).
- Keep the "Choose A or B:" structure of equipment lists and the Markdown emphasis intact.
- Convert coin abbreviations: GP → GM, SP → SM, CP → KM.
Respond exclusively with valid JSON, no extra text.
</rules>`;

/** System-Prompt für Hintergrund-Übersetzung (name/desc + Array-of-Objects: benefits). */
export function buildBackgroundTranslationSystemPrompt(sourceEn = ''): string {
  return [BACKGROUND_INTRO, buildTerminologyBlock(sourceEn), BACKGROUND_IO].filter(Boolean).join('\n\n');
}

/** System-Prompt für Monster-Übersetzung, mit relevanz-gefilterter Terminologie zum Quelltext. */
export function buildMonsterTranslationSystemPrompt(sourceEn = ''): string {
  return [MONSTER_INTRO, buildTerminologyBlock(sourceEn), MONSTER_IO].filter(Boolean).join('\n\n');
}

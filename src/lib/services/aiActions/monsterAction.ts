/**
 * KI-Aktionen für Monster (Anlage / Überarbeitung) als `EntityActionSpec`.
 * Workflow + Boilerplate stecken in factory.ts; hier nur Schema + Prosa.
 */
import type { Monster } from '../../types';
import { monsterSchema } from '../../schemas/monster';
import { toLlmJsonSchema } from '../../schemas/llmJson';
import { parseMonster } from '../../utils/schemaValidation';
import {
  MONSTER_LIBRARY_TOOLS_ANTHROPIC,
  MONSTER_LIBRARY_TOOLS_OPENAI,
  executeMonsterLibraryTool,
} from '../monsterLibraryTools';
import { buildCreateAction, buildEditAction, type CreateActionOptions } from './factory';
import type { EntityActionSpec } from './spec';

export function isMonster(data: unknown): data is Monster {
  return parseMonster(data).ok;
}

/**
 * Die Feldkonventionen, die aus dem JSON-Schema allein nicht hervorgehen — Fuß als
 * Speichereinheit und die zweisprachigen Feldpaare sind beide unsichtbar, solange nur die
 * Typen dastehen. Vor jedem Prompt-Teil, deshalb als Konstante.
 */
const FIELD_RULES = `## Field conventions
- All ranges and distances are stored in FEET as plain integers: \`speed.*\`, \`senses.*\`,
  \`attacks[].reach\`, \`attacks[].range\`, \`attacks[].long_range\`. Never write metres, never write units.
- \`challenge_rating\` is a NUMBER (0.125, 0.25, 0.5, 1 … 30), never a string like "1/4". Keep \`xp\` consistent with it.
- \`saving_throws\` and \`skill_bonuses\` hold only PROFICIENT entries as numbers, keyed in English
  (\`{"con": 4}\`, \`{"Stealth": 6}\`). Omit anything the creature is not proficient in — plain ability
  modifiers are derived by the app.
- \`damage_resistances\`/\`_immunities\`/\`_vulnerabilities\` and \`condition_immunities\` are lists of the
  schema's English keys. Anything a list cannot express (e.g. "nonmagical weapons") goes into \`defenses_desc\`.
- \`traits[]\` holds passive features. Everything the creature actively does goes into ONE \`actions[]\`
  list, distinguished by \`action_type\`: ACTION, BONUS_ACTION, REACTION, LEGENDARY_ACTION.
  Limited use goes into \`usage_limits\` — \`{"type": "RECHARGE_ON_ROLL", "param": 5}\` means "Recharge 5–6".
- An attack that rolls to hit belongs in \`actions[].attacks[]\` as structured numbers; the prose in
  \`desc\` describes it, it does not replace it. A multiattack action has NO \`attacks\` entries.
- Every trait and action carries \`name\`/\`desc\` (German, displayed) and \`name_en\`/\`desc_en\`
  (English original). The same holds for the creature's \`name\`/\`name_en\`. When you invent content,
  fill both sides; \`size\`, \`type\` and \`alignment\` are always the schema's English keys.`;

const LIBRARY_RULES = `## Library research
\`search_monster_library\`, \`list_monster_library\` and \`get_monster\` search the campaign's OWN monster
library — SRD 5.2 and homebrew side by side, all in this exact schema. Use them to ground numbers on
comparable creatures of the same challenge rating instead of guessing. There is no other source: a
creature you do not find there does not exist in this campaign yet, and you are building it now.`;

const monsterSpec: EntityActionSpec<Monster> = {
  entity: 'monster',
  nounDe: 'Monster',
  currentHeading: 'Aktuelles Monster',
  jsonSchema: toLlmJsonSchema(monsterSchema),
  validate: isMonster,
  anthropicTools: MONSTER_LIBRARY_TOOLS_ANTHROPIC,
  openAiTools: MONSTER_LIBRARY_TOOLS_OPENAI,
  execute: executeMonsterLibraryTool,
  buildCreatePrompt({ templateBlock, nameHint }) {
    if (templateBlock) {
      return `You are an assistant for Dungeons & Dragons (5e). From a template and the user's wishes, build a monster stat block as JSON in the app schema. Write all human-readable content fields in German.
${templateBlock}

${FIELD_RULES}

${LIBRARY_RULES}

## Procedure
1. Start from the template and keep its values wherever the user's description does not demand otherwise.
2. Apply the user's wishes and keep the numbers mechanically consistent (\`challenge_rating\`/\`xp\` matching hit points, armor class and damage output).
3. Set \`source\` to "homebrew-sam" — even when the template came from the SRD, the result is a variant.
4. ALWAYS output the COMPLETE monster JSON per the schema.${nameHint}`;
    }
    return `You are an assistant for Dungeons & Dragons (5e). From a description, build a monster stat block as JSON in the app schema. Write all human-readable content fields in German.

${FIELD_RULES}

${LIBRARY_RULES}

## Procedure
1. Search the library first. A fitting creature is your base: load it with \`get_monster\` and adapt it.
2. Otherwise build the creature yourself, with \`challenge_rating\`/\`xp\` consistent with hit points, armor class and damage output — check the numbers against a library creature of the same challenge rating.
3. Set \`source\` to "srd-2024" only when you reproduce an SRD creature unchanged; anything you invent or modify is "homebrew-sam".
4. ALWAYS output the COMPLETE monster JSON per the schema.${nameHint}`;
  },
  buildEditPrompt({ currentBlock }) {
    return `You are an assistant for Dungeons & Dragons (5e). You revise an EXISTING monster stat block according to the user's change requests and output the complete, updated monster JSON in the app schema. Keep human-readable content fields in German.
${currentBlock}

${FIELD_RULES}

${LIBRARY_RULES}

## Procedure
1. Apply ONLY the requested changes. Unaffected fields stay UNCHANGED.
2. Keep the numbers mechanically consistent — \`challenge_rating\` and \`xp\` must still match hit points, armor class and damage output.
3. \`source\` stays as it is.
4. ALWAYS output the COMPLETE monster JSON — not just the changed fields.`;
  },
};

/** Bestehende API: „Monster per KI anlegen". */
export const createMonsterAction = (opts: CreateActionOptions<Monster> = {}) => buildCreateAction(monsterSpec, opts);
/** Bestehende API: „Monster per KI überarbeiten". */
export const editMonsterAction = (current: Monster) => buildEditAction(monsterSpec, current);

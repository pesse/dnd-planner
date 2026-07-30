/**
 * Tool-Definitionen für die Open5e-v2-Zaubersuche (analog `open5eItemTools.ts`).
 * Beide Formate: OpenAI-Function-Calling (Groq) + Anthropic native.
 * Der Executor ruft die Transport-Helfer aus `open5eApi.ts`.
 *
 * Deckt srd-2024-Zauber (`/v2/spells/`) ab; `get_open5e_spell` löst den Key auf.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { searchOpen5eSpells, getSpell } from './open5eApi';

interface ToolDef {
  name: string;
  description: string;
  params: Anthropic.Tool.InputSchema;
}

const TOOL_LIST: ToolDef[] = [
  {
    name: 'search_open5e_spells',
    description:
      'Search Open5e v2 (SRD 5.2, 2024 rules) for spells by name. ' +
      'The query MUST be in ENGLISH (e.g. "fireball", "cure wounds"). ' +
      'Returns a JSON list of { index, name, url }. Pick the closest match and load it with get_open5e_spell.',
    params: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'English search term, e.g. "fireball".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_open5e_spell',
    description:
      'Fetches the full JSON of an Open5e v2 spell by its key (from a search result `url`/`index`). ' +
      'Use when the complete, specific content of an existing spell is needed.',
    params: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Open5e v2 spell key, e.g. "srd-2024_fireball".' },
      },
      required: ['key'],
    },
  },
];

/** OpenAI-/Groq-kompatibles Tool-Format. */
export const OPEN5E_SPELL_TOOLS_OPENAI = TOOL_LIST.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.params },
}));

/** Anthropic-kompatibles Tool-Format. */
export const OPEN5E_SPELL_TOOLS_ANTHROPIC: Anthropic.Tool[] = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.params,
}));

export async function executeOpen5eSpellTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_open5e_spells': {
      const results = await searchOpen5eSpells(String(args.query ?? ''));
      return JSON.stringify(results.slice(0, 15));
    }
    case 'get_open5e_spell': {
      const data = await getSpell(String(args.key ?? ''));
      return JSON.stringify(data);
    }
    default:
      throw new Error(`Unknown Open5e spell tool: ${name}`);
  }
}

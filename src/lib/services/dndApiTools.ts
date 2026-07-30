/**
 * Tool-Definitionen für die DnD-5e-API-Suche (analog `vaultTools.ts`).
 * Beide Formate: OpenAI-Function-Calling (Groq) + Anthropic native.
 * Der Executor ruft die geteilten Helfer aus `dndApi.ts`.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { searchMonsters, getResource } from './dndApi';

interface ToolDef {
  name: string;
  description: string;
  params: Anthropic.Tool.InputSchema;
}

const TOOL_LIST: ToolDef[] = [
  {
    name: 'search_dnd_api',
    description:
      'Search the official D&D 5e SRD (dnd5eapi.co) for MONSTERS/creatures by name. ' +
      '(Items and spells come from a different source — do not search them here.) ' +
      'The query MUST be in ENGLISH (e.g. "goblin"). ' +
      'Returns a JSON list of { index, name, url }. Pick the closest match and load it with get_dnd_api_resource.',
    params: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['monsters'],
          description: 'Which SRD collection to search (only monsters).',
        },
        query: { type: 'string', description: 'English search term, e.g. "goblin".' },
      },
      required: ['category', 'query'],
    },
  },
  {
    name: 'get_dnd_api_resource',
    description: `
      Fetches the full JSON stat block of a D&D 5e SRD resource by its API url.
      Can be an item, spell, class, monster etc. 
      Use when the complete, specific content of an existing D&D item is needed`,
    params: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'API url path from a search result.' },
      },
      required: ['url'],
    },
  },
];

/** OpenAI-/Groq-kompatibles Tool-Format. */
export const DND_TOOLS_OPENAI = TOOL_LIST.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.params },
}));

/** Anthropic-kompatibles Tool-Format. */
export const DND_TOOLS_ANTHROPIC: Anthropic.Tool[] = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.params,
}));

export async function executeDndTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_dnd_api': {
      const query = String(args.query ?? '');
      const results = await searchMonsters(query);
      return JSON.stringify(results.slice(0, 15));
    }
    case 'get_dnd_api_resource': {
      const data = await getResource(String(args.url ?? ''));
      return JSON.stringify(data);
    }
    default:
      throw new Error(`Unknown DnD tool: ${name}`);
  }
}

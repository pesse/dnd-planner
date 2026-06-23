/**
 * Tool-Definitionen für die DnD-5e-API-Suche (analog `vaultTools.ts`).
 * Beide Formate: OpenAI-Function-Calling (Groq/xAI) + Anthropic native.
 * Der Executor ruft die geteilten Helfer aus `dndApi.ts`.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { searchEquipment, searchMagicItems, searchMonsters, searchSpells, getResource } from './dndApi';

interface ToolDef {
  name: string;
  description: string;
  params: Anthropic.Tool.InputSchema;
}

const TOOL_LIST: ToolDef[] = [
  {
    name: 'search_dnd_api',
    description:
      'Search the official D&D 5e SRD (dnd5eapi.co) by name. ' +
      'category "equipment" = mundane gear/weapons/armor, "magic-items" = magic items, ' +
      '"monsters" = creatures/stat blocks, "spells" = spells. ' +
      'The query MUST be in ENGLISH (e.g. "warhammer", "goblin", "fireball"). ' +
      'Returns a JSON list of { index, name, url }. Pick the closest match and load it with get_dnd_api_resource.',
    params: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['equipment', 'magic-items', 'monsters', 'spells'],
          description: 'Which SRD collection to search.',
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

/** OpenAI-/Groq-/xAI-kompatibles Tool-Format. */
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
      const category = String(args.category ?? 'equipment');
      const query = String(args.query ?? '');
      const search =
        category === 'magic-items' ? searchMagicItems
        : category === 'monsters' ? searchMonsters
        : category === 'spells' ? searchSpells
        : searchEquipment;
      const results = await search(query);
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

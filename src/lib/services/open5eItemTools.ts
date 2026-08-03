/**
 * Tool-Definitionen für die Open5e-v2-Gegenstandssuche (analog `dndApiTools.ts`).
 * Beide Formate: OpenAI-Function-Calling (Groq) + Anthropic native.
 * Der Executor ruft die Transport-Helfer aus `open5eApi.ts`.
 *
 * Deckt srd-2024-Ausrüstung (`/v2/items/`) UND magische Gegenstände
 * (`/v2/magicitems/`) ab; `get_open5e_item` löst den Key gegen beide Endpunkte auf.
 */
import { searchOpen5eItems, getOpen5eItem } from './open5eClient';
import { toolDefsToAnthropic, toolDefsToOpenAi, type ToolDef } from './toolDef';

const TOOL_LIST: ToolDef[] = [
  {
    name: 'search_open5e_items',
    description:
      'Search Open5e v2 (SRD 5.2, 2024 rules) for items by name — both mundane equipment ' +
      '(weapons, armor, gear, tools) and magic items (rings, potions, wondrous items, magic weapons/armor). ' +
      'The query MUST be in ENGLISH (e.g. "battleaxe", "chain mail", "flame tongue"). ' +
      'Returns a JSON list of { index, name, url, tag } (tag: "ausrüstung" | "magisch"). ' +
      'Pick the closest match and load it with get_open5e_item.',
    params: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'English search term, e.g. "battleaxe".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_open5e_item',
    description:
      'Fetches the full JSON of an Open5e v2 item by its key (from a search result `url`/`index`), ' +
      'including the inline weapon/armor stats. Use when the complete, specific content of an existing item is needed.',
    params: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Open5e v2 item key, e.g. "srd-2024_battleaxe".' },
      },
      required: ['key'],
    },
  },
];

export const OPEN5E_ITEM_TOOLS_OPENAI = toolDefsToOpenAi(TOOL_LIST);
export const OPEN5E_ITEM_TOOLS_ANTHROPIC = toolDefsToAnthropic(TOOL_LIST);

export async function executeOpen5eItemTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_open5e_items': {
      const results = await searchOpen5eItems(String(args.query ?? ''));
      return JSON.stringify(results.slice(0, 15));
    }
    case 'get_open5e_item': {
      const data = await getOpen5eItem(String(args.key ?? ''));
      return JSON.stringify(data);
    }
    default:
      throw new Error(`Unknown Open5e item tool: ${name}`);
  }
}

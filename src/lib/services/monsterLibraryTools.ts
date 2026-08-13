/**
 * Agent-Tools für die Monster-Bibliothek (analog `open5eSpellTools.ts`).
 * Beide Formate: OpenAI-Function-Calling (Groq) + Anthropic native.
 *
 * Die Bibliothek ist die EINZIGE Monsterquelle — es gibt keinen Laufzeit-Zugriff auf Open5e.
 * Damit sieht das Modell Homebrew und SRD gleichrangig, und was es findet, existiert im Vault
 * auch als Datei; ein Encounter kann den Slug direkt verlinken.
 */
import { getMonsterLibrary, searchMonsterLibrary, type MonsterLibraryHit } from '$lib/monsterLibrary';
import { toolDefsToAnthropic, toolDefsToOpenAi, type ToolDef } from './toolDef';

const TOOL_LIST: ToolDef[] = [
  {
    name: 'search_monster_library',
    description:
      'Search the local monster library (SRD 5.2 and homebrew alike) by name. ' +
      'Matches the German name, the English name and the slug, so either language works. ' +
      'Returns a JSON list of { slug, name, name_en, challenge_rating, type, size, source }. ' +
      'The `slug` is what an encounter references — load full stats with get_monster.',
    params: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name fragment, e.g. "goblin" or "Oger".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_monster_library',
    description:
      'Lists the monster library filtered by challenge rating, for picking encounter opposition. ' +
      'Use when no specific name is wanted but a fitting difficulty is. ' +
      'Returns the same summary shape as search_monster_library.',
    params: {
      type: 'object',
      properties: {
        min_cr: { type: 'number', description: 'Lowest challenge rating to include, e.g. 0.25.' },
        max_cr: { type: 'number', description: 'Highest challenge rating to include, e.g. 3.' },
        type: { type: 'string', description: 'Optional creature type filter, e.g. "humanoid".' },
      },
      required: [],
    },
  },
  {
    name: 'get_monster',
    description:
      'Fetches the full stat block of one library monster by its slug (from a search result). ' +
      'Use when the complete numbers of an existing monster are needed.',
    params: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Library slug, e.g. "goblin-warrior".' },
      },
      required: ['slug'],
    },
  },
];

export const MONSTER_LIBRARY_TOOLS_OPENAI = toolDefsToOpenAi(TOOL_LIST);
export const MONSTER_LIBRARY_TOOLS_ANTHROPIC = toolDefsToAnthropic(TOOL_LIST);

const summarize = ({ slug, monster }: MonsterLibraryHit) => ({
  slug,
  name: monster.name,
  name_en: monster.name_en,
  challenge_rating: monster.challenge_rating,
  type: monster.type,
  size: monster.size,
  source: monster.source,
});

export async function executeMonsterLibraryTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_monster_library': {
      const hits = await searchMonsterLibrary(String(args.query ?? ''), 15);
      return JSON.stringify(hits.map(summarize));
    }
    case 'list_monster_library': {
      const min = typeof args.min_cr === 'number' ? args.min_cr : -Infinity;
      const max = typeof args.max_cr === 'number' ? args.max_cr : Infinity;
      const type = args.type ? String(args.type).toLowerCase() : '';
      const hits = (await getMonsterLibrary()).filter(
        (h) =>
          h.monster.challenge_rating >= min &&
          h.monster.challenge_rating <= max &&
          (!type || h.monster.type === type),
      );
      return JSON.stringify(hits.slice(0, 40).map(summarize));
    }
    case 'get_monster': {
      const slug = String(args.slug ?? '');
      const hit = (await getMonsterLibrary()).find((h) => h.slug === slug);
      if (!hit) return JSON.stringify({ error: `Kein Monster mit dem Slug "${slug}" in der Bibliothek.` });
      return JSON.stringify(hit.monster);
    }
    default:
      throw new Error(`Unknown monster library tool: ${name}`);
  }
}

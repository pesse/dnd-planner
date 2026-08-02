/**
 * Agent-Tools für das Regel-Nachschlagewerk (analog `dndApiTools.ts`).
 * Beide Formate: OpenAI-Function-Calling + Anthropic native. Executor ruft die
 * Laufzeit-Helfer aus `rulesReference.ts`. Rückgaben sind JSON-Strings mit Quelle.
 */
import type { AgentToolset } from './vaultTools';
import { lookupRule, searchRules } from './rulesReference';
import { toolDefsToAnthropic, toolDefsToOpenAi, type ToolDef } from './toolDef';

const TOOL_LIST: ToolDef[] = [
  {
    name: 'lookup_rule',
    description:
      'Look up an official German D&D 5e rules term in the Regelglossar (SRD 5.2.1). ' +
      'Accepts a German OR English term (e.g. "Gelegenheitsangriff" or "Opportunity Attack"). ' +
      'Returns the official German definition, category, cross-references (seeAlso) and page. ' +
      'Use this FIRST for any rules-terminology question. On a miss it returns close suggestions.',
    params: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'The rules term to look up (German or English).' },
      },
      required: ['term'],
    },
  },
  {
    name: 'search_rules',
    description:
      'Full-text search over the German SRD rules prose (combat, character creation, classes, ' +
      'equipment, spellcasting). Returns the top matching passages with section and page. ' +
      'Use when lookup_rule has no exact entry, or the question is about how a rule works ' +
      'in prose rather than a single defined term. Query in German for best results.',
    params: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, ideally in German.' },
        k: { type: 'integer', description: 'Max number of passages to return (default 5).' },
      },
      required: ['query'],
    },
  },
];

export const RULES_TOOLS_OPENAI = toolDefsToOpenAi(TOOL_LIST);
export const RULES_TOOLS_ANTHROPIC = toolDefsToAnthropic(TOOL_LIST);

const GLOSSARY_SOURCE = 'DE SRD 5.2.1 Regelglossar';

export async function executeRulesTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'lookup_rule': {
      const res = lookupRule(String(args.term ?? ''));
      if (!res.found || !res.entry) {
        return JSON.stringify({ found: false, suggestions: res.suggestions ?? [], source: GLOSSARY_SOURCE });
      }
      const e = res.entry;
      return JSON.stringify({
        found: true,
        matchType: res.matchType,
        term: e.de,
        en: e.en,
        category: e.cat,
        definition: e.definition,
        seeAlso: e.seeAlso,
        page: e.page,
        source: GLOSSARY_SOURCE,
      });
    }
    case 'search_rules': {
      const k = Number(args.k);
      const results = searchRules(String(args.query ?? ''), Number.isFinite(k) && k > 0 ? k : 5);
      return JSON.stringify({ query: String(args.query ?? ''), results, source: 'DE SRD 5.2.1' });
    }
    default:
      throw new Error(`Unknown rules tool: ${name}`);
  }
}

/** Toolset für das Regel-Nachschlagewerk — via composeToolsets mit anderen kombinierbar. */
export const RULES_TOOLSET: AgentToolset = {
  anthropicTools: RULES_TOOLS_ANTHROPIC,
  openAiTools: RULES_TOOLS_OPENAI,
  execute: (name, args) => executeRulesTool(name, args),
};

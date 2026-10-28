/** System-Prompt des Vault-Agenten: Werkzeuge, Vault-Struktur, Vorlagen, Regel-Recherche. */
import type { Campaign } from '../types';
import { DOCUMENT_TEMPLATES } from '../templates';
import { encounterSchema } from '../schemas/encounter';
import { monsterSchema } from '../schemas/monster';
import { npcSchema } from '../schemas/npc';
import { toLlmJsonSchema } from '../schemas/llmJson';

const MARKDOWN_TEMPLATES = ['campaign', 'act', 'session', 'world'] as const;

const JSON_SCHEMAS = { encounter: encounterSchema, monster: monsterSchema, npc: npcSchema };

function documentTemplatesSection(): string {
  const markdown = MARKDOWN_TEMPLATES.map(
    (type) => `<template type="${type}">\n${DOCUMENT_TEMPLATES[type]}\n</template>`,
  );
  const json = Object.entries(JSON_SCHEMAS).map(
    ([type, schema]) =>
      `<json_schema type="${type}">\n${JSON.stringify(toLlmJsonSchema(schema))}\n</json_schema>`,
  );
  return (
    `Markdown documents start with \`# Title\` followed by the template body:\n` +
    `<document_templates>\n${markdown.join('\n')}\n</document_templates>\n` +
    `Encounter, monster and NPC files are JSON matching these schemas:\n` +
    `<json_schemas>\n${json.join('\n')}\n</json_schemas>\n\n`
  );
}

export function buildAgentSystemPrompt(systemPrompt: string, campaign: Campaign | null): string {
  const campaignHint = campaign
    ? `\nActive campaign: "${campaign.name}" — vault path: ./vault/campaigns/${campaign.path}/`
    : '';

  return (
    systemPrompt +
    `\n\n## Vault Agent Mode\n` +
    `You have access to the vault filesystem via these tools:\n` +
    `- **list_files(path)**: Lists .md files in a vault directory\n` +
    `- **list_json_files(path)**: Lists .json files (encounters, monsters)\n` +
    `- **read_file(path)**: Reads any vault file (markdown or JSON)\n` +
    `- **write_file(path, content)**: Creates or overwrites a vault file (parent dirs auto-created)\n\n` +
    `Vault structure:\n` +
    `\`\`\`\nvault/\n  monsters/*.json              ← global monster library\n  campaigns/{slug}/\n    campaign.md\n    sessions/*.md\n    npcs/*.json\n    world/*.md\n    acts/{act-slug}/\n      index.md                 ← the act itself\n      encounters/*.json        ← act encounters\n      monsters/*.json          ← act-specific monster variants (override global)\n\`\`\`\n\nMonster lookup order: act-local → global library. ` +
    `Use act-local monsters (acts/{act}/monsters/{slug}.json) for encounter-specific variants or new creatures specific to this act. ` +
    `Use the global library (vault/monsters/{slug}.json) for reusable monsters that appear across campaigns.` +
    campaignHint +
    `\n\n## Document Templates\n` +
    documentTemplatesSection() +
    `When creating a new file, follow the matching template or schema above. ` +
    `Filenames use kebab-case slugs. ` +
    `Workflow: read relevant files first to understand current state, then act. ` +
    `When a task involves an act and its encounter, update BOTH files. ` +
    `Write complete, well-structured content. Summarize what you did at the end.` +
    `\n\n## Rules Reference\n` +
    `<rules_reference>\n` +
    `For D&D rules questions, consult the official German SRD 5.2.1 via these tools:\n` +
    `- lookup_rule(term): the official Regelglossar definition of a term (accepts German OR English), with category, cross-references and page. Use this FIRST for any terminology question.\n` +
    `- search_rules(query): full-text search over the rules prose (combat, character creation, classes, equipment, spellcasting), returning passages with section and page. Use for how-a-rule-works questions or when lookup_rule has no exact entry. Query in German.\n` +
    `Ground your rules answers in these tools. If nothing is found, say so — never invent rules. Cite section and page, and answer in German.\n` +
    `</rules_reference>`
  );
}

/**
 * Baut den System-Prompt aus dem gesammelten Kontext — je Abschnitt eine Funktion.
 * Rein: keine Stores, kein Vault-Zugriff. Die Reihenfolge der Abschnitte steckt
 * ausschließlich in `buildSystemPrompt`.
 */
import type { Campaign, FileEntry, Monster } from '../types';
import { monsterSizeLabel, monsterTypeLabel } from '../types';
import { formatMinimumLine } from './characterContext';
import { parseFrontmatter, stripFrontmatter } from '../utils/frontmatter';
import { renderJsonFormat } from './contextJsonFormat';
import { crLabel } from './monsterFormat';
import type { ActSummaryEntry, CharacterCompact, ContextFlags, EncounterSummaryEntry, MonsterLibraryEntry, PinnedEntry } from './contextTypes';

export interface SystemPromptInput {
  activeFile: FileEntry | null;
  activeCampaign: Campaign | null;
  fileContent: string;
  pinnedEntries: PinnedEntry[];
  actSummaries: ActSummaryEntry[];
  encounterSummaries: EncounterSummaryEntry[];
  monsterLibrary: MonsterLibraryEntry[];
  encounterMonsterDefs: Monster[];
  campaignContent: string;
  flags: ContextFlags;
  party: CharacterCompact[];
  characterBlocks: Map<string, string>;
}

const ROLE =
  'You are a helpful assistant for a Dungeon Master. ' +
  'You help create and manage D&D campaigns, scenarios, NPCs, and world-building. ' +
  'Always respond in the same language the user writes in.';

const FILE_TYPE_FOCUS: Partial<Record<FileEntry['type'], string>> = {
  campaign:
    'You are working on the **campaign overview** — the top-level reference document for this campaign. ' +
    'It should contain ONLY what cannot be found elsewhere: Prämisse (1-2 sentences), Hauptkonflikt (overarching arc), ' +
    'Fraktionen (name + goal), Spielercharaktere (name, class, motivation), Ton & Stil (mood/themes), ' +
    'Offene Geheimnisse (campaign-wide unresolved mysteries). ' +
    'Do NOT include: NPC details (use npcs/*.md), session events (use sessions/*.md), ' +
    'act-level content (use acts/*/index.md), or world-building details (use world/*.md). ' +
    'Keep it concise — this document is always included in the LLM context, so every line must earn its place.',
  act:
    'You are working on an **act**. ' +
    'Structure: ## Summary (2-3 sentences), ## Ergebnis (what players achieved), ' +
    '## Details (challenges, NPC motivations, player choices & consequences). ' +
    'Always maintain this structure when editing.',
  session: 'You are working on a **session note** — short, informal DM notes. No fixed structure.',
  npc: 'You are working on an **NPC**. Output as a single ```json ... ``` block matching the schema.',
  world:
    'You are working on a **world-building entry**. ' +
    'Structure: ## Summary (brief overview), ## Details (history, geography, factions, culture, ' +
    'game-relevant specifics). Always maintain this structure when editing.',
  character:
    'You are working on a **player character**. ' +
    'Focus: background, personality, connections to the world, open story hooks.',
};

export function renderFocus(type: FileEntry['type'] | undefined): string | null {
  const focus = type ? FILE_TYPE_FOCUS[type] : undefined;
  return focus ? `\n## Current Focus\n${focus}` : null;
}

/** Der volle Kampagnentext, außer die campaign.md ist selbst offen — dann nur ihr Name. */
export function renderCampaign(campaign: Campaign | null, campaignContent: string, activeType: FileEntry['type'] | undefined, flags: ContextFlags): string | null {
  if (!campaign || !flags.campaign) return null;
  if (campaignContent && activeType !== 'campaign')
    return `\n## Campaign Overview\n\`\`\`markdown\n${stripFrontmatter(campaignContent)}\n\`\`\``;
  return `\n## Active Campaign\nName: ${campaign.name}`;
}

/** Bei einer Session nur die Charaktere, die ihr Frontmatter nennt. */
export function renderParty(party: CharacterCompact[], activeFile: FileEntry | null, fileContent: string, flags: ContextFlags): string | null {
  if (party.length === 0 || !flags.characters) return null;
  let show = party;
  if (activeFile?.type === 'session' && fileContent) {
    const { frontmatter } = parseFrontmatter(fileContent);
    if (frontmatter.characters && frontmatter.characters.length > 0) {
      const slugs = new Set(frontmatter.characters);
      show = party.filter((c) => slugs.has(c.slug));
    }
  }
  return show.length > 0 ? `\n## Party Characters\n${show.map(formatMinimumLine).join('\n')}` : null;
}

/** Nur die anderen Akte: der offene steht vollständig als Active File im Prompt. */
export function renderActs(acts: ActSummaryEntry[], activeFile: FileEntry | null, flags: ContextFlags): string | null {
  if (acts.length === 0 || !flags.acts) return null;
  const activeActPath = activeFile?.type === 'act' ? activeFile.path : null;
  const blocks = acts
    .filter((act) => act.path !== activeActPath)
    .map((act) => `### ${act.title}\n${act.summary}`);
  return blocks.length > 0 ? `\n## Act Overviews\n${blocks.join('\n\n---\n\n')}` : null;
}

const encounterLine = (e: EncounterSummaryEntry, tag: string): string =>
  `- **${e.name}** (${e.actSlug}${tag}, ${e.difficulty}, ${e.xpTotal} XP): ${e.monsterList}`;

/**
 * Vergangen vs. geplant wird über die alphabetische Akt-Reihenfolge entschieden — die
 * Akt-Ordner sind durchnummeriert, es gibt keine andere Chronologie im Vault.
 */
export function renderEncounters(encounters: EncounterSummaryEntry[], acts: ActSummaryEntry[], activeFile: FileEntry | null, flags: ContextFlags): string[] {
  if (encounters.length === 0 || !flags.encounters) return [];
  const currentActSlug = activeFile?.path?.match(/\/acts\/([^/]+)\//)?.[1] ?? null;
  const sortedActNames = [...acts].sort((a, b) => a.name.localeCompare(b.name)).map((a) => a.name);
  const currentActIndex = currentActSlug ? sortedActNames.indexOf(currentActSlug) : -1;
  const pastActSlugs = new Set(currentActIndex >= 0 ? sortedActNames.slice(0, currentActIndex) : []);

  // Der offene Encounter ist als Active File schon vollständig enthalten.
  const activeEncSlug = activeFile?.type === 'encounter' ? activeFile.name : null;
  const activeEncActSlug = activeFile?.path?.match(/\/acts\/([^/]+)\/encounters\//)?.[1] ?? null;
  const isActive = (e: EncounterSummaryEntry) =>
    e.slug === activeEncSlug && e.actSlug === activeEncActSlug;

  const past = encounters.filter((e) => pastActSlugs.has(e.actSlug) && !isActive(e));
  const upcoming = encounters.filter((e) => !pastActSlugs.has(e.actSlug) && !isActive(e));

  const parts: string[] = [];
  if (past.length > 0)
    parts.push(
      `\n## Past Encounters\n${past.map((e) => encounterLine(e, e.status === 'skipped' ? ' [skipped]' : ' [done]')).join('\n')}`,
    );
  if (upcoming.length > 0)
    parts.push(
      `\n## Planned Encounters\n${upcoming.map((e) => encounterLine(e, e.status !== 'planned' ? ` [${e.status}]` : '')).join('\n')}`,
    );
  return parts;
}

/** Die gewählten Bibliotheks-Gruppen kondensiert, plus die Volldefinitionen des offenen Encounters. */
export function renderMonsters(library: MonsterLibraryEntry[], encounterDefs: Monster[], activeFile: FileEntry | null, flags: ContextFlags): string[] {
  const parts: string[] = [];
  if (flags.monsterGroups.length > 0) {
    const filtered = library.filter((m) => flags.monsterGroups.includes(m.group));
    if (filtered.length > 0) {
      const lines = filtered.map(
        (m) => `- ${m.slug} — ${m.name} (CR ${crLabel(m.challenge_rating)}, ${monsterSizeLabel(m.size)} ${monsterTypeLabel(m.type)})`,
      );
      parts.push(`\n## Monster Library\n${lines.join('\n')}`);
    }
  }
  if (encounterDefs.length > 0 && flags.encounterMonsters && activeFile?.type === 'encounter') {
    const jsons = encounterDefs.map((m) => JSON.stringify(m, null, 2)).join(',\n');
    parts.push(`\n## Monsters in This Encounter\n\`\`\`json\n[${jsons}]\n\`\`\``);
  }
  return parts;
}

/**
 * Beim Charakter immer der voll aufgelöste Block aus der Map, nie das rohe JSON. Fehlt er
 * noch, läuft die Auflösung — dann nichts ausgeben.
 */
export function renderActiveFile(activeFile: FileEntry | null, fileContent: string, characterBlocks: Map<string, string>, flags: ContextFlags): string | null {
  if (!activeFile || !fileContent || !flags.activeFile) return null;
  if (activeFile.type === 'character') {
    const block = characterBlocks.get(activeFile.path);
    return block ? `\n${block}` : null;
  }
  const label =
    activeFile.type === 'act'
      ? `Active Act: ${activeFile.name}`
      : `Current File: ${activeFile.name} (${activeFile.type})`;
  const lang =
    activeFile.type === 'encounter' || activeFile.type === 'monster' || activeFile.type === 'npc'
      ? 'json'
      : 'markdown';
  const body = lang === 'markdown' ? stripFrontmatter(fileContent) : fileContent;
  return `\n## ${label}\n\`\`\`${lang}\n${body}\n\`\`\``;
}

export function renderPins(pins: PinnedEntry[], activeFile: FileEntry | null, characterBlocks: Map<string, string>, flags: ContextFlags): string[] {
  const parts: string[] = [];
  for (const pin of pins) {
    if (!pin.isCharacter) {
      parts.push(`\n## ${pin.entry.name}\n\`\`\`markdown\n${pin.content}\n\`\`\``);
      continue;
    }
    // Doppelung vermeiden: der offene Charakter steht schon als Active File drin.
    if (activeFile?.type === 'character' && pin.entry.path === activeFile.path && flags.activeFile) continue;
    const block = characterBlocks.get(pin.entry.path);
    if (block) parts.push(`\n${block}`); // fehlt noch → nichts (kein rohes JSON)
  }
  return parts;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { activeFile, fileContent, flags, characterBlocks } = input;
  const parts: (string | null)[] = [
    ROLE,
    renderFocus(activeFile?.type),
    renderCampaign(input.activeCampaign, input.campaignContent, activeFile?.type, flags),
    renderParty(input.party, activeFile, fileContent, flags),
    renderActs(input.actSummaries, activeFile, flags),
    ...renderEncounters(input.encounterSummaries, input.actSummaries, activeFile, flags),
    ...renderMonsters(input.monsterLibrary, input.encounterMonsterDefs, activeFile, flags),
    renderJsonFormat(activeFile?.type),
    renderActiveFile(activeFile, fileContent, characterBlocks, flags),
    ...renderPins(input.pinnedEntries, activeFile, characterBlocks, flags),
  ];
  return parts.filter((p): p is string => p !== null).join('\n');
}

/**
 * Die EINZIGE Stelle, an der ein Charakter für ein LLM formatiert wird. Überschriften sind
 * Prompt-Gerüst und darum englisch, die Werte bleiben deutsch wie im Bogen — sie kommen aus
 * `characterSummary`, hier entsteht keine weitere Tabelle.
 */
import { invoke } from '@tauri-apps/api/core';
import { type Character, type PersonalData } from '../schemas/characterSchema';
import { formatSpecies, formatClassLevel, totalLevel } from '../schemas/classLevelText';
import { normalizeCharacter } from '../utils/schemaValidation';
import { sign } from '../utils/num';
import { SKILL_DEFS } from '../domain/skills';
import { characterSummary, type SummarySectionId, type SummaryValue } from './characterSummary';
import {
  resolveCharacterFeatures,
  type ResolvedFeatureGroup,
  type ResolvedFeature,
} from './characterFeatures';
import { contextLines, loadSheetSpellcasting } from './spellcasting/project';

export type CharacterContextLevel = 'minimum' | 'character' | 'full';

/** Aufsteigende Tiefe — die Reihenfolge, in der die UI die Umschalt-Knöpfe zeigt. */
export const CHARACTER_CONTEXT_LEVELS: CharacterContextLevel[] = ['minimum', 'character', 'full'];

export const CHARACTER_CONTEXT_LABELS: Record<CharacterContextLevel, string> = {
  minimum: 'Minimal',
  character: 'Bogen',
  full: 'Voll',
};

export const CHARACTER_CONTEXT_HINTS: Record<CharacterContextLevel, string> = {
  minimum: 'Nur Identität: Name, Spieler, Spezies, Hintergrund, Klasse & Stufe.',
  character: 'Kompletter Bogen inkl. der aus der Bibliothek aufgelösten Merkmalstexte.',
  full: 'Bogen zusätzlich mit Details und GM-Notizen aus dem Charakter-Ordner.',
};

export interface CharacterMinimum {
  slug: string;
  name: string;
  playerName: string;
  species: string;
  background: string;
  classLevel: string;
  totalLevel: number;
}

/** Erst die Links, dann der Freitext: Altdateien vor `upgradeCharacter` haben nur den. */
export function characterMinimum(c: Character, slug = ''): CharacterMinimum {
  return {
    slug,
    name: c.name,
    playerName: c.playerName ?? '',
    species: formatSpecies(c.species) || c.race || '',
    background: c.backgroundRef?.name?.trim() || c.background || '',
    classLevel: formatClassLevel(c.classes) || c.classLevel || '',
    totalLevel: totalLevel(c.classes),
  };
}

/** Einzeiler für Listen: `- Silvara (Elf, Waldläufer 5 (Jäger des Grauens), Weise, Spieler: Ada)`. */
export function formatMinimumLine(m: CharacterMinimum): string {
  const parts: string[] = [];
  if (m.species) parts.push(m.species);
  if (m.classLevel) parts.push(m.classLevel);
  if (m.background) parts.push(m.background);
  if (m.playerName) parts.push(`Spieler: ${m.playerName}`);
  return parts.length ? `- ${m.name} (${parts.join(', ')})` : `- ${m.name}`;
}

export interface CharacterNotes {
  details?: string;
  gmNotes?: string;
}

/** `### Title` + Zeilen, oder null, wenn nach dem Filtern nichts übrig bleibt. */
function section(title: string, lines: (string | false | null | undefined)[]): string | null {
  const body = lines.filter((l): l is string => typeof l === 'string' && l.length > 0);
  return body.length ? `### ${title}\n${body.join('\n')}` : null;
}

type SummaryValues = Record<SummarySectionId, SummaryValue[]>;

const summaryValues = (c: Character): SummaryValues =>
  Object.fromEntries(characterSummary(c).map((s) => [s.id, s.values])) as SummaryValues;

/** `- Weapons: Einfache Waffen, Kriegswaffen` — alle Werte einer Sektion in einer Zeile. */
const labelLine = (title: string, values: SummaryValue[]): string | false =>
  values.length > 0 && `- ${title}: ${values.map((v) => v.label).join(', ')}`;

function headerBlock(m: CharacterMinimum, xp: string): string {
  const lines = [`## Character: ${m.name || '(unbenannt)'}`];
  if (m.playerName) lines.push(`- Player: ${m.playerName}`);
  if (m.species) lines.push(`- Species: ${m.species}`);
  if (m.background) lines.push(`- Background: ${m.background}`);
  if (m.classLevel) lines.push(`- Class & Level: ${m.classLevel}${m.totalLevel ? ` (total ${m.totalLevel})` : ''}`);
  if (xp.trim()) lines.push(`- XP: ${xp.trim()}`);
  return lines.join('\n');
}

function abilitiesBlock(s: SummaryValues): string | null {
  const rows = s.abilities.map(
    (v) => `- ${v.short} ${v.score} (${v.detail}${v.note ? `, ${v.note}` : ''})`,
  );
  return section('Abilities', rows);
}

function combatBlock(c: Character): string | null {
  const lines: (string | false)[] = [
    c.ac.trim() && `- AC: ${c.ac}`,
    c.initiative.trim() && `- Initiative: ${c.initiative}`,
    c.speed.trim() && `- Speed: ${c.speed}`,
    (c.hpCurrent.trim() || c.hpMax.trim()) &&
      `- HP: ${c.hpCurrent.trim() || '?'}/${c.hpMax.trim() || '?'}${c.hpTemp.trim() ? ` (temp ${c.hpTemp.trim()})` : ''}`,
    c.hitDice.trim() && `- Hit Dice: ${c.hitDice}`,
    `- Proficiency Bonus: ${sign(c.proficiencyBonus)}`,
    c.passivePerception.trim() && `- Passive Perception: ${c.passivePerception}`,
  ];
  return section('Combat', lines);
}

const skillOrder = (v: SummaryValue): number => SKILL_DEFS.findIndex((d) => d.label === v.label);

/** Eine Zeile je Fertigkeit: Expertise steht zwischen den übrigen, nicht hinter ihnen. */
function skillsBlock(s: SummaryValues): string | null {
  const lines = [...s.skills, ...s.expertise]
    .sort((a, b) => skillOrder(a) - skillOrder(b))
    .map((v) => `- ${v.label}: ${v.detail}${v.note ? ` (${v.note})` : ''}`);
  return section('Skill Proficiencies', lines);
}

function proficienciesBlock(c: Character, s: SummaryValues): string | null {
  const lines: (string | false)[] = [
    labelLine('Weapons', s.weapons),
    labelLine('Armor', s.armor),
    labelLine('Weapon Masteries', s.masteries),
    labelLine('Languages', s.languages),
    labelLine('Tools', s.tools),
    c.alleskoenner && '- Jack of all Trades: ja',
  ];
  return section('Proficiencies', lines);
}

function attacksBlock(c: Character): string | null {
  const lines = (c.attacks ?? [])
    .filter((a) => a.name.trim())
    .map((a) => {
      const bits = [
        a.bonus.trim() && `Angriff ${a.bonus}`,
        a.damage.trim() && `Schaden ${a.damage}${a.type.trim() ? ` ${a.type}` : ''}`,
        a.range.trim() && `Reichweite ${a.range}`,
      ].filter(Boolean);
      return `- **${a.name}**${bits.length ? ` — ${bits.join(', ')}` : ''}`;
    });
  return section('Attacks', lines);
}

async function spellcastingBlock(c: Character): Promise<string | null> {
  const view = await loadSheetSpellcasting(c);
  return view.hasContent ? section('Spellcasting', contextLines(view)) : null;
}

function equipmentBlock(c: Character): string | null {
  const lines: string[] = [];
  const inv = (c.inventory ?? []).filter((i) => i.name.trim());
  if (inv.length) {
    lines.push('- Inventory:');
    for (const i of inv) {
      const meta = [i.count.trim() && `×${i.count.trim()}`, i.weight.trim() && `${i.weight.trim()}`]
        .filter(Boolean)
        .join(', ');
      lines.push(`  - ${i.name}${meta ? ` (${meta})` : ''}`);
    }
  }
  const coins = (['pm', 'gm', 'em', 'sm', 'km'] as const)
    .map((k) => c.currency[k].trim() && `${c.currency[k].trim()} ${k.toUpperCase()}`)
    .filter(Boolean);
  if (coins.length) lines.push(`- Coins: ${coins.join(', ')}`);
  if (c.totalWeight.trim()) lines.push(`- Total Weight: ${c.totalWeight.trim()}`);
  if (c.inventoryNotes.trim()) lines.push(`- Notes: ${c.inventoryNotes.trim()}`);
  return section('Equipment', lines);
}

function personalityBlock(c: Character): string | null {
  const lines: (string | false)[] = [
    c.traits.trim() && `- Wesenszüge: ${c.traits.trim()}`,
    c.ideals.trim() && `- Ideale: ${c.ideals.trim()}`,
    c.bonds.trim() && `- Bindungen: ${c.bonds.trim()}`,
    c.flaws.trim() && `- Makel: ${c.flaws.trim()}`,
  ];
  return section('Personality', lines);
}

const PERSONAL_FIELDS: { key: keyof PersonalData; label: string }[] = [
  { key: 'alter', label: 'Alter' },
  { key: 'geschlecht', label: 'Geschlecht' },
  { key: 'gesinnung', label: 'Gesinnung' },
  { key: 'glaube', label: 'Glaube' },
  { key: 'sizeCat', label: 'Größenkategorie' },
  { key: 'koerpergroesse', label: 'Körpergröße' },
  { key: 'gewicht', label: 'Gewicht' },
  { key: 'augenfarbe', label: 'Augenfarbe' },
  { key: 'haarfarbe', label: 'Haarfarbe' },
  { key: 'hautfarbe', label: 'Hautfarbe' },
  { key: 'lebensstil', label: 'Lebensstil' },
  { key: 'taeglicheKosten', label: 'Tägliche Kosten' },
  { key: 'rassenmerkmale', label: 'Rassenmerkmale' },
  { key: 'aussehen', label: 'Aussehen' },
];

function personalBlock(c: Character): string | null {
  const p = c.personal;
  const lines = PERSONAL_FIELDS.map(({ key, label }) =>
    p[key].trim() ? `- ${label}: ${p[key].trim()}` : '',
  );
  return section('Personal Details', lines);
}

function renderFeature(f: ResolvedFeature): string {
  const meta: string[] = [];
  if (f.gainedAt) meta.push(`Stufe ${f.gainedAt}`);
  if (f.choice) meta.push(`Entscheidung: ${f.choice}`);
  const head = `- **${f.name}**${meta.length ? ` (${meta.join('; ')})` : ''}`;
  const desc = f.desc?.trim();
  return desc ? `${head}\n  ${desc.replace(/\n/g, '\n  ')}` : head;
}

function renderGroup(g: ResolvedFeatureGroup): string {
  const lines = [`#### ${g.title}`];
  if (g.unresolved)
    lines.push('_(nicht in der Bibliothek verlinkt — keine Merkmalstexte verfügbar)_');
  for (const f of g.features) lines.push(renderFeature(f));
  return lines.join('\n');
}

async function featuresBlock(c: Character): Promise<string | null> {
  const r = await resolveCharacterFeatures(c);
  const groups = [...r.speciesGroups, ...r.classGroups, ...r.backgroundGroups];
  if (!groups.length && !r.featEntries.length && !r.orphanChoices.length) return null;

  const blocks: string[] = ['### Features & Traits (resolved from the library)'];
  for (const g of groups) blocks.push(renderGroup(g));
  if (r.featEntries.length) {
    blocks.push('#### Talente');
    for (const f of r.featEntries) blocks.push(renderFeature(f));
  }
  if (r.orphanChoices.length) {
    blocks.push('#### Entscheidungen ohne zugeordnetes Merkmal');
    for (const f of r.orphanChoices) blocks.push(renderFeature(f));
  }
  return blocks.join('\n');
}

/** Freitext des Bogens — trägt die Spieler-Formulierung, die die Bibliothekstexte nicht ersetzt. */
function classFeaturesBlock(c: Character): string | null {
  const t = c.classFeatures?.trim();
  return t ? `### Class Features (character sheet notes)\n${t}` : null;
}

/** Mindestens eine Zeile, die keine Überschrift ist — hält das GM-Notizen-Skelett aus dem Prompt. */
function hasProse(md: string): boolean {
  return md.split('\n').some((line) => {
    const t = line.trim();
    return t.length > 0 && !t.startsWith('#');
  });
}

export async function buildCharacterContext(
  c: Character,
  level: CharacterContextLevel,
  notes?: CharacterNotes,
): Promise<string> {
  const m = characterMinimum(c);
  if (level === 'minimum') return headerBlock(m, c.xp);

  const s = summaryValues(c);
  const parts: string[] = [headerBlock(m, c.xp)];
  const sections = [
    abilitiesBlock(s),
    combatBlock(c),
    skillsBlock(s),
    proficienciesBlock(c, s),
    attacksBlock(c),
    await spellcastingBlock(c),
    equipmentBlock(c),
    personalityBlock(c),
    personalBlock(c),
    await featuresBlock(c),
    classFeaturesBlock(c),
  ].filter((s): s is string => !!s);
  parts.push(...sections);

  if (level === 'full' && notes) {
    const details = notes.details?.trim();
    if (details && hasProse(details)) parts.push(`### Details\n${details}`);
    const gm = notes.gmNotes?.trim();
    if (gm && hasProse(gm)) parts.push(`### DM Notes (DM only)\n${gm}`);
  }
  return parts.join('\n\n');
}

/** Der Rohtext läuft durch `normalizeCharacter`, also durch die Upgrade-Pipeline. */
export async function buildCharacterContextFromRaw(
  raw: string,
  level: CharacterContextLevel,
  notes?: CharacterNotes,
): Promise<string | null> {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  return buildCharacterContext(normalizeCharacter(obj), level, notes);
}

export function characterDirOf(path: string): string {
  return path.replace(/\/character\.json$/, '');
}

/** `freitext.md` ist der Altname von `details.md` und muss weiter gelesen werden. */
export async function loadCharacterNotes(dirPath: string): Promise<CharacterNotes> {
  const notes: CharacterNotes = {};
  try {
    notes.details = await invoke<string>('read_file_content', { path: `${dirPath}/details.md` });
  } catch {
    try {
      notes.details = await invoke<string>('read_file_content', { path: `${dirPath}/freitext.md` });
    } catch {
      /* keine Details */
    }
  }
  try {
    notes.gmNotes = await invoke<string>('read_file_content', { path: `${dirPath}/gm-notes.md` });
  } catch {
    /* keine GM-Notizen */
  }
  return notes;
}

/** Für den Agent-Pfad: der Charakter wird selbst nachgeladen, nicht hereingereicht. */
export async function loadCharacterContext(
  dirPath: string,
  level: CharacterContextLevel,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await invoke<string>('read_file_content', { path: `${dirPath}/character.json` });
  } catch {
    return null;
  }
  const notes = level === 'full' ? await loadCharacterNotes(dirPath) : undefined;
  return buildCharacterContextFromRaw(raw, level, notes);
}

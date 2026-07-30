/**
 * Die EINZIGE Stelle, an der ein Charakter für ein LLM formatiert wird. Drei Tiefen:
 *
 *   - `minimum`   — Identität (Name, Spieler, Spezies, Hintergrund, Klasse+Stufe).
 *   - `character` — `minimum` + voll aufgelöster Bogen inkl. der aus der Bibliothek
 *                   gejointen Merkmalstexte und der getroffenen Entscheidungen.
 *   - `full`      — `character` + `details.md` + `gm-notes.md` (Letzteres „DM only").
 *
 * Sprache (CLAUDE.md): Abschnittsüberschriften/Labels sind Prompt-Gerüst → englisch;
 * die Werte bleiben deutsch, wie sie im Bogen stehen. Fertigkeits-/Waffen-/Rüstungs-
 * Labels kommen aus `SKILL_DEFS` bzw. `WEAPON_LABEL_DE`/`ARMOR_LABEL_DE` — es entsteht
 * KEINE vierte Übersetzungstabelle.
 *
 * Ab `character` ist der Aufbau asynchron: die Merkmalstexte liegen im Vault, nicht am
 * Charakter (`resolveCharacterFeatures`).
 */
import { invoke } from '@tauri-apps/api/core';
import {
  type Character,
  type PersonalData,
  formatSpecies,
  formatClassLevel,
  totalLevel,
} from '../schemas/character';
import { normalizeCharacter } from '../utils/schemaValidation';
import { skillEnName } from '../pdf/characterFields';
import { skillLabelDe, WEAPON_LABEL_DE, ARMOR_LABEL_DE } from './proficiencyGrants';
import {
  resolveCharacterFeatures,
  type ResolvedFeatureGroup,
  type ResolvedFeature,
} from './characterFeatures';

// ── Stufen ────────────────────────────────────────────────────────────────────

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

// ── Minimum ─────────────────────────────────────────────────────────────────────

export interface CharacterMinimum {
  slug: string;
  name: string;
  playerName: string;
  species: string;
  background: string;
  classLevel: string;
  totalLevel: number;
}

/**
 * Identitäts-Extrakt. Bevorzugt die LINKS und fällt auf die abgeleiteten Freitext-
 * Strings zurück — Altdateien, die noch nicht durch `upgradeCharacter` gelaufen sind,
 * tragen ihre Werte nur dort.
 */
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

// ── Kontext-Block ─────────────────────────────────────────────────────────────

export interface CharacterNotes {
  details?: string;
  gmNotes?: string;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** `### Title` + Zeilen, oder null, wenn nach dem Filtern nichts übrig bleibt. */
function section(title: string, lines: (string | false | null | undefined)[]): string | null {
  const body = lines.filter((l): l is string => typeof l === 'string' && l.length > 0);
  return body.length ? `### ${title}\n${body.join('\n')}` : null;
}

const ABILITIES = [
  { key: 'str', label: 'STR' },
  { key: 'ges', label: 'GES' },
  { key: 'kon', label: 'KON' },
  { key: 'int', label: 'INT' },
  { key: 'wei', label: 'WEI' },
  { key: 'cha', label: 'CHA' },
] as const;

function headerBlock(m: CharacterMinimum, xp: string): string {
  const lines = [`## Character: ${m.name || '(unbenannt)'}`];
  if (m.playerName) lines.push(`- Player: ${m.playerName}`);
  if (m.species) lines.push(`- Species: ${m.species}`);
  if (m.background) lines.push(`- Background: ${m.background}`);
  if (m.classLevel) lines.push(`- Class & Level: ${m.classLevel}${m.totalLevel ? ` (total ${m.totalLevel})` : ''}`);
  if (xp.trim()) lines.push(`- XP: ${xp.trim()}`);
  return lines.join('\n');
}

function abilitiesBlock(c: Character): string | null {
  const nums = c as unknown as Record<string, number>;
  const flags = c as unknown as Record<string, boolean>;
  const rows = ABILITIES.map(({ key, label }) => {
    const val = nums[key] ?? 0;
    const mod = nums[`${key}Mod`] ?? 0;
    const save = flags[`${key}SaveProf`] ? ', Rettungswurf geübt' : '';
    return `- ${label} ${val} (${signed(mod)}${save})`;
  });
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
    `- Proficiency Bonus: ${signed(c.proficiencyBonus)}`,
    c.passivePerception.trim() && `- Passive Perception: ${c.passivePerception}`,
  ];
  return section('Combat', lines);
}

function skillsBlock(c: Character): string | null {
  const lines: string[] = [];
  for (const [key, s] of Object.entries(c.skills ?? {})) {
    if (!s.prof && !s.exp) continue;
    const label = skillLabelDe(skillEnName(key) ?? key);
    lines.push(`- ${label}: ${signed(s.value)}${s.exp ? ' (Expertise)' : ''}`);
  }
  return section('Skill Proficiencies', lines);
}

function proficienciesBlock(c: Character): string | null {
  const p = c.proficiencies;
  const weapons = [
    p.simpleWeapons && WEAPON_LABEL_DE.Simple,
    p.martialWeapons && WEAPON_LABEL_DE.Martial,
    p.otherWeapons.trim(),
  ].filter(Boolean);
  const armor = [
    p.lightArmor && ARMOR_LABEL_DE.Light,
    p.mediumArmor && ARMOR_LABEL_DE.Medium,
    p.heavyArmor && ARMOR_LABEL_DE.Heavy,
    p.shields && ARMOR_LABEL_DE.Shields,
  ].filter(Boolean);
  const lines: (string | false)[] = [
    weapons.length > 0 && `- Weapons: ${weapons.join(', ')}`,
    armor.length > 0 && `- Armor: ${armor.join(', ')}`,
    (c.masteries?.length ?? 0) > 0 && `- Weapon Masteries: ${c.masteries.join(', ')}`,
    (c.languages?.length ?? 0) > 0 && `- Languages: ${c.languages.join(', ')}`,
    (c.tools?.length ?? 0) > 0 && `- Tools: ${c.tools.join(', ')}`,
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

function spellcastingBlock(c: Character): string | null {
  const sp = c.spells;
  if (!sp) return null;
  const grades = Object.keys(sp.byLevel)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const hasAny =
    sp.spellcastingClass.trim() || sp.cantrips.length || grades.length || sp.slots.some((s) => s.total > 0);
  if (!hasAny) return null;

  const lines: (string | false)[] = [
    sp.spellcastingClass.trim() && `- Class: ${sp.spellcastingClass}`,
    sp.spellcastingAbility.trim() && `- Ability: ${sp.spellcastingAbility}`,
    sp.saveDC > 0 && `- Save DC: ${sp.saveDC}`,
    sp.attackBonus !== 0 && `- Attack Bonus: ${signed(sp.attackBonus)}`,
  ];
  const slotLines = sp.slots
    .map((s, i) => ({ lvl: i + 1, ...s }))
    .filter((s) => s.total > 0)
    .map((s) => `  - Grad ${s.lvl}: ${s.total - s.used}/${s.total} frei`);
  if (slotLines.length) lines.push('- Slots:', ...slotLines);
  if (sp.cantrips.length) lines.push(`- Zaubertricks: ${sp.cantrips.map((c) => c.name).join(', ')}`);
  for (const g of grades) {
    const entries = sp.byLevel[String(g)] ?? [];
    if (!entries.length) continue;
    const names = entries.map((e) => `${e.name}${e.prepared ? ' (vorbereitet)' : ''}`).join(', ');
    lines.push(`- Grad ${g}: ${names}`);
  }
  return section('Spellcasting', lines);
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

/** Ein aufgelöstes Merkmal als Listeneintrag samt (eingerücktem) Regeltext. */
function renderFeature(f: ResolvedFeature): string {
  const meta: string[] = [];
  if (f.gainedAt) meta.push(`Stufe ${f.gainedAt}`);
  if (f.choice) meta.push(`Entscheidung: ${f.choice}`);
  const head = `- **${f.name}**${meta.length ? ` (${meta.join('; ')})` : ''}`;
  const desc = f.desc?.trim();
  return desc ? `${head}\n  ${desc.replace(/\n/g, '\n  ')}` : head;
}

/** Eine Merkmalsgruppe (`#### Titel` + Merkmale). Unaufgelöste Links werden benannt. */
function renderGroup(g: ResolvedFeatureGroup): string {
  const lines = [`#### ${g.title}`];
  if (g.unresolved)
    lines.push('_(nicht in der Bibliothek verlinkt — keine Merkmalstexte verfügbar)_');
  for (const f of g.features) lines.push(renderFeature(f));
  return lines.join('\n');
}

async function featuresBlock(c: Character): Promise<string | null> {
  const r = await resolveCharacterFeatures(c);
  // Reihenfolge: Spezies → Klasse/Subklasse → Hintergrund → Talente → verwaiste Entscheidungen.
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

/**
 * Formatiert einen Charakter als Markdown-Block für den System-Prompt. `minimum`
 * liefert nur den Kopf; ab `character` kommen die Bogen-Abschnitte (jeder entfällt,
 * wenn leer); bei `full` zusätzlich `details.md`/`gm-notes.md` aus `notes`.
 */
export async function buildCharacterContext(
  c: Character,
  level: CharacterContextLevel,
  notes?: CharacterNotes,
): Promise<string> {
  const m = characterMinimum(c);
  if (level === 'minimum') return headerBlock(m, c.xp);

  const parts: string[] = [headerBlock(m, c.xp)];
  const sections = [
    abilitiesBlock(c),
    combatBlock(c),
    skillsBlock(c),
    proficienciesBlock(c),
    attacksBlock(c),
    spellcastingBlock(c),
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

/**
 * Wie `buildCharacterContext`, aber aus dem rohen Datei-Inhalt (JSON-String). Läuft
 * durch `normalizeCharacter` (inkl. Upgrade-Pipeline). null bei ungültigem JSON.
 */
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

/** Charakter-Ordner aus einem `…/character.json`-Pfad. */
export function characterDirOf(path: string): string {
  return path.replace(/\/character\.json$/, '');
}

/**
 * Lädt `details.md` (Fallback auf den Altnamen `freitext.md`) und `gm-notes.md`
 * aus dem Charakter-Ordner. Fehlt eine Datei, bleibt ihr Feld leer.
 */
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

/**
 * Lädt `character.json` aus einem Ordner und baut den Kontext. Bei `full` werden auch
 * die Begleitdateien geladen. Für den Agent-Pfad gedacht (Charakter selbst nachladen).
 */
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

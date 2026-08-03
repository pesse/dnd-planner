/**
 * Die gruppierten Bäume der Seitenleiste: Monster nach Typ, Zauber nach Schule
 * (zweite Gruppierung nach Grad) und Gegenstände nach Kategorie.
 */
import { invoke } from '@tauri-apps/api/core';
import { ITEMS_PATH, invalidateItemCache, listItemDirs } from '../../itemLibrary';
import { CATEGORY_LABELS, DIR_TO_CATEGORY, rarityColor } from '../../itemLabels';
import { SCHOOL_COLORS } from '../../spellLibrary';
import { monsterTypeLabel, type FileEntry } from '../../types';
import type { CreateKind } from './createSpecs';

const MONSTERS_PATH = './vault/monsters';
const SPELLS_PATH = './vault/spells';

export interface TreeBadge {
  kind: 'cr' | 'level' | 'rarity';
  text?: string;
  color?: string;
  title?: string;
}

export interface TreeLeaf {
  label: string;
  /** Name des Eintrags in `activeFile` (Dateiname ohne Endung). */
  entryName: string;
  path: string;
  /** Pfad-Ende, an dem der aktive Eintrag erkannt wird. */
  suffix: string;
  groupId: string;
  badge?: TreeBadge;
}

export interface TreeGroup {
  id: string;
  label: string;
  color?: string;
  badge?: TreeBadge;
  /** Gesetzt, wenn die Gruppen schon vollständig geladen wurden (Monster). */
  leaves?: TreeLeaf[];
}

export interface GroupedSection {
  kind: CreateKind;
  type: FileEntry['type'];
  label: string;
  addTitle: string;
  emptyLabel: string;
  headerClass?: string;
  searchable?: boolean;
  /** Zweite Gruppierung über die geladenen Blätter. */
  altMode?: { primaryLabel: string; label: string; build: (leaves: TreeLeaf[]) => TreeGroup[] };
  /** Hängt an `vaultVersion` und lädt vor dem Anlege-Dialog. */
  live?: boolean;
  loadGroups: () => Promise<TreeGroup[]>;
  /** Fehlt bei Bäumen, die schon in `loadGroups` alles lesen. */
  loadLeaves?: (groupId: string) => Promise<TreeLeaf[]>;
  invalidate?: (groupId: string) => void;
}

interface JsonEntry { name: string; is_dir: boolean }

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await invoke<string>('read_file_content', { path }));

const listDirs = async (path: string): Promise<string[]> => {
  const entries = await invoke<JsonEntry[]>('list_json_entries', { path });
  return entries.filter((e) => e.is_dir).map((e) => e.name).sort();
};

// Grad-Badge: Hue = Schulfarbe (Zugehörigkeit), Helligkeit = Grad (Intensität).
// Grad 0 (Zaubertrick) leicht aufgehellt = schwächster, Grad 9 am dunkelsten = intensivster.
const spellBadgeColor = (baseColor: string, level: number): string => {
  if (level <= 0) return `color-mix(in srgb, ${baseColor} 78%, white)`;
  const darken = Math.min((level - 1) * 6, 48); // 0 % (Grad 1) … 48 % Schwarz (Grad 9)
  return `color-mix(in srgb, ${baseColor}, black ${darken}%)`;
};

// Ordnername → englischer Schulschlüssel (die Farbe hängt am Schlüssel).
const SCHOOL_DIR_TO_KEY: Record<string, string> = {
  'bannmagie':       'abjuration',
  'beschwörung':     'conjuration',
  'erkenntnismagie': 'divination',
  'verzauberung':    'enchantment',
  'hervorrufung':    'evocation',
  'illusionsmagie':  'illusion',
  'nekromantie':     'necromancy',
  'verwandlung':     'transmutation',
};

const schoolColor = (school: string): string => SCHOOL_COLORS[SCHOOL_DIR_TO_KEY[school]] ?? 'var(--ink)';

const levelBadge = (level: number, color: string, title?: string): TreeBadge => ({
  kind: 'level',
  text: level === 0 ? 'Z' : String(level),
  color: spellBadgeColor(color, level),
  title: title ?? (level === 0 ? 'Zaubertrick' : `Grad ${level}`),
});

/** Grad eines Zauber-Blattes; steckt im Badge-Text („Z" = Zaubertrick). */
const leafLevel = (leaf: TreeLeaf): number => (leaf.badge?.text === 'Z' ? 0 : Number(leaf.badge?.text ?? 0));

async function loadMonsterGroups(): Promise<TreeGroup[]> {
  const toLeaf = async (path: string, filename: string): Promise<{ typeKey: string; leaf: TreeLeaf }> => {
    const base = {
      entryName: filename.replace('.json', ''),
      path,
      suffix: filename,
      groupId: '',
    };
    try {
      const data = await readJson(path);
      const cr = ((data.cr as string | number | undefined) ?? '').toString().trim();
      return {
        typeKey: (data.type as string) ?? '',
        leaf: {
          ...base,
          label: (data.name as string) ?? base.entryName,
          badge: cr ? { kind: 'cr', text: cr, title: `Herausforderungsgrad ${cr}` } : undefined,
        },
      };
    } catch {
      return { typeKey: '', leaf: { ...base, label: base.entryName } };
    }
  };

  try {
    const entries = await invoke<JsonEntry[]>('list_json_entries', { path: MONSTERS_PATH });
    const dirs = entries.filter((e) => e.is_dir).map((e) => e.name);
    const rootFiles = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => e.name);

    const all: { typeKey: string; leaf: TreeLeaf }[] = [];
    for (const dir of dirs) {
      const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${dir}` }).catch(() => [] as string[]);
      all.push(...await Promise.all(files.map((f) => toLeaf(`${MONSTERS_PATH}/${dir}/${f}`, `${dir}/${f}`))));
    }
    all.push(...await Promise.all(rootFiles.map((f) => toLeaf(`${MONSTERS_PATH}/${f}`, f))));

    const byType: Record<string, TreeLeaf[]> = {};
    for (const { typeKey, leaf } of all) {
      const id = typeKey || 'unknown';
      (byType[id] ??= []).push({ ...leaf, groupId: id });
    }
    return Object.keys(byType)
      .sort((a, b) => monsterTypeLabel(a).localeCompare(monsterTypeLabel(b), 'de'))
      .map((id) => ({ id, label: monsterTypeLabel(id), leaves: byType[id] }));
  } catch {
    return [];
  }
}

async function loadSpellLeaves(school: string): Promise<TreeLeaf[]> {
  const color = schoolColor(school);
  try {
    const files = await invoke<string[]>('list_json_files', { path: `${SPELLS_PATH}/${school}` });
    const leaves = await Promise.all(files.map(async (filename): Promise<TreeLeaf> => {
      const path = `${SPELLS_PATH}/${school}/${filename}`;
      const base = { entryName: filename.replace('.json', ''), path, suffix: `/${school}/${filename}`, groupId: school };
      try {
        const data = await readJson(path);
        const level = (data.level as number) ?? 0;
        return { ...base, label: (data.name as string) ?? base.entryName, badge: levelBadge(level, color) };
      } catch {
        return { ...base, label: base.entryName, badge: levelBadge(0, color) };
      }
    }));
    leaves.sort((a, b) => a.label.localeCompare(b.label, 'de'));
    return leaves;
  } catch {
    return [];
  }
}

/** Alle geladenen Zauber nach Grad (0–9); die Schule bleibt am Eintrag erhalten. */
function spellsByLevel(leaves: TreeLeaf[]): TreeGroup[] {
  const byLevel: Record<number, TreeLeaf[]> = {};
  for (const leaf of leaves) (byLevel[leafLevel(leaf)] ??= []).push(leaf);
  return Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => ({
      id: String(level),
      label: level === 0 ? 'Zaubertricks' : `Grad ${level}`,
      badge: levelBadge(level, 'var(--ink-muted)', ''),
      leaves: byLevel[level]
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, 'de'))
        // Im Grad-Baum benennt das Badge die Schule, nicht noch einmal den Grad.
        .map((leaf) => ({ ...leaf, badge: levelBadge(level, schoolColor(leaf.groupId), leaf.groupId) })),
    }));
}

async function loadItemLeaves(dir: string): Promise<TreeLeaf[]> {
  try {
    const files = await invoke<string[]>('list_json_files', { path: `${ITEMS_PATH}/${dir}` });
    const leaves = await Promise.all(files.map(async (filename): Promise<TreeLeaf> => {
      const path = `${ITEMS_PATH}/${dir}/${filename}`;
      const base = { entryName: filename.replace('.json', ''), path, suffix: `/${dir}/${filename}`, groupId: dir };
      try {
        const data = await readJson(path);
        const rarity = ((data.rarity as { name?: string } | undefined)?.name) ?? '';
        return {
          ...base,
          label: (data.name_de as string) ?? (data.name as string) ?? base.entryName,
          badge: { kind: 'rarity', color: rarityColor(rarity) },
        };
      } catch {
        return { ...base, label: base.entryName, badge: { kind: 'rarity', color: rarityColor('') } };
      }
    }));
    leaves.sort((a, b) => a.label.localeCompare(b.label, 'de'));
    return leaves;
  } catch {
    return [];
  }
}

/** Anzeige-Label eines Item-Ordners; Legacy-Ordner (z.B. „wondrous-items") mit auflösen. */
const itemDirLabel = (dir: string): string => CATEGORY_LABELS[DIR_TO_CATEGORY[dir] ?? dir] ?? dir;

export const GROUPED_SECTIONS: GroupedSection[] = [
  {
    kind: 'monster', type: 'monster', label: 'Monster', addTitle: 'Neues Monster',
    emptyLabel: 'Keine Monster',
    loadGroups: loadMonsterGroups,
  },
  {
    kind: 'spell', type: 'spell', label: 'Zauber', addTitle: 'Neuer Zauber',
    emptyLabel: 'Keine Zauber', searchable: true,
    altMode: { primaryLabel: 'Schule', label: 'Grad', build: spellsByLevel },
    loadGroups: async () =>
      (await listDirs(SPELLS_PATH).catch(() => [])).map((school) => ({
        id: school,
        label: school.charAt(0).toUpperCase() + school.slice(1),
        color: schoolColor(school),
      })),
    loadLeaves: loadSpellLeaves,
  },
  {
    kind: 'item', type: 'item', label: 'Gegenstände', addTitle: 'Neuer Gegenstand',
    emptyLabel: 'Keine Gegenstände', searchable: true, live: true,
    headerClass: 'item-group-header',
    loadGroups: async () => (await listItemDirs()).map((dir) => ({ id: dir, label: itemDirLabel(dir) })),
    loadLeaves: loadItemLeaves,
    invalidate: invalidateItemCache,
  },
];

/**
 * Die gruppierten Bäume der Seitenleiste: Monster nach Typ, Zauber nach Schule
 * (zweite Gruppierung nach Grad), Gegenstände und Talente nach Kategorie.
 */
import { getItemsByDir, invalidateItemCache, listItemDirs } from '../../itemLibrary';
import { rarityColor } from '../../itemLabels';
import { itemDirLabel } from '../catalog/itemCatalog';
import { SPELLS_PATH } from '../../spellLibrary';
import {
  levelBadgeText, levelGroupLabel, levelLabel, schoolDirColor as schoolColor, schoolDirLabel, spellBadgeColor,
} from '../spellBadge';
import { MONSTERS_PATH } from '../../monsterLibrary';
import { FEAT_CATEGORY_DE, featDisplayName, getFeats, invalidateFeatsCache } from '../../featsLibrary';
import { FEAT_CATEGORIES } from '../../schemas/vocabulary';
import { crLabel } from '../monsterFormat';
import { parseMonster } from '../../utils/schemaValidation';
import { monsterTypeLabel, type FileEntry } from '../../types';
import { listSubdirs, scanJsonFolder, type FileContext } from '../library/createLibrary';
import type { CreateKind } from './createSpecs';
import type { CatalogKind } from '../catalog/catalogTypes';

export interface TreeBadge {
  kind: 'cr' | 'level' | 'rarity';
  text?: string;
  color?: string;
  title?: string;
}

export interface TreeLeaf {
  label: string;
  /** Englischer Originalname; die Suche trifft auch ihn. */
  nameEn?: string;
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
  /** Gesetzt: Klick auf Sektion oder Gruppe öffnet die Tabellen-Übersicht statt aufzuklappen. */
  catalog?: CatalogKind;
  /** Zweite Gruppierung über die geladenen Blätter. */
  altMode?: { primaryLabel: string; label: string; build: (leaves: TreeLeaf[]) => TreeGroup[]; catalog?: CatalogKind };
  loadGroups: () => Promise<TreeGroup[]>;
  /** Fehlt bei Bäumen, die schon in `loadGroups` alles lesen. */
  loadLeaves?: (groupId: string) => Promise<TreeLeaf[]>;
  invalidate?: (groupId: string) => void;
}

const levelBadge = (level: number, color: string, title?: string): TreeBadge => ({
  kind: 'level',
  text: levelBadgeText(level),
  color: spellBadgeColor(color, level),
  title: title ?? levelLabel(level),
});

/** Grad eines Zauber-Blattes; steckt im Badge-Text („Z" = Zaubertrick). */
const leafLevel = (leaf: TreeLeaf): number => (leaf.badge?.text === 'Z' ? 0 : Number(leaf.badge?.text ?? 0));

/** `dir` leer = die flach im Wurzelordner liegenden Monster. */
function monsterLeaves(dir: string): Promise<{ typeKey: string; leaf: TreeLeaf }[]> {
  const folder = dir ? `${MONSTERS_PATH}/${dir}` : MONSTERS_PATH;
  const base = ({ path, filename }: FileContext) => ({
    entryName: filename.replace('.json', ''),
    path,
    suffix: dir ? `${dir}/${filename}` : filename,
    groupId: '',
  });
  /**
   * Eine unparsbare Datei behält ihr Blatt mit dem Dateinamen — sonst verschwindet sie aus
   * der Seitenleiste und ist nicht mehr zu öffnen, also auch nicht mehr zu reparieren.
   */
  const fallback = (ctx: FileContext) => ({ typeKey: '', leaf: { ...base(ctx), label: base(ctx).entryName } });
  return scanJsonFolder<{ typeKey: string; leaf: TreeLeaf }>(
    folder,
    (data, ctx) => {
      const parsed = parseMonster(data);
      if (!parsed.ok) return fallback(ctx);
      const cr = crLabel(parsed.data.challenge_rating);
      return {
        typeKey: parsed.data.type,
        leaf: {
          ...base(ctx),
          label: parsed.data.name || base(ctx).entryName,
          nameEn: parsed.data.name_en,
          badge: { kind: 'cr', text: cr, title: `Herausforderungsgrad ${cr}` },
        },
      };
    },
    fallback,
  );
}

async function loadMonsterGroups(): Promise<TreeGroup[]> {
  try {
    const dirs = await listSubdirs(MONSTERS_PATH);
    const all = (await Promise.all([...dirs, ''].map(monsterLeaves))).flat();

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
  const base = ({ path, filename }: FileContext) => ({
    entryName: filename.replace('.json', ''),
    path,
    suffix: `/${school}/${filename}`,
    groupId: school,
  });
  try {
    const leaves = await scanJsonFolder<TreeLeaf>(
      `${SPELLS_PATH}/${school}`,
      (data, ctx) => ({
        ...base(ctx),
        label: (data.name as string) ?? base(ctx).entryName,
        nameEn: data.name_en as string | undefined,
        badge: levelBadge((data.level as number) ?? 0, color),
      }),
      (ctx) => ({ ...base(ctx), label: base(ctx).entryName, badge: levelBadge(0, color) }),
    );
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
      label: levelGroupLabel(level),
      badge: levelBadge(level, 'var(--ink-muted)', ''),
      leaves: byLevel[level]
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, 'de'))
        // Im Grad-Baum benennt das Badge die Schule, nicht noch einmal den Grad.
        .map((leaf) => ({ ...leaf, badge: levelBadge(level, schoolColor(leaf.groupId), leaf.groupId) })),
    }));
}

/** Über `getItemsByDir`, nicht per eigenem Scan: sonst liest und parst `items/weapon` (493
 * Dateien) ein zweites Mal, was der Charakterbogen gerade geladen hat. */
async function loadItemLeaves(dir: string): Promise<TreeLeaf[]> {
  const leaves = (await getItemsByDir(dir)).map((item) => {
    const filename = item.path.slice(item.path.lastIndexOf('/') + 1);
    return {
      entryName: filename.replace('.json', ''),
      path: item.path,
      suffix: `/${dir}/${filename}`,
      groupId: dir,
      label: item.name_de ?? item.name,
      nameEn: item.name,
      badge: { kind: 'rarity', color: rarityColor(item.rarity) } as TreeBadge,
    };
  });
  leaves.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return leaves;
}

async function loadFeatGroups(): Promise<TreeGroup[]> {
  const leaves = (await getFeats()).map((feat) => {
    const filename = feat.path.slice(feat.path.lastIndexOf('/') + 1);
    return {
      entryName: filename.replace('.json', ''),
      path: feat.path,
      suffix: `feats/${filename}`,
      groupId: feat.category ?? 'General',
      label: featDisplayName(feat),
      nameEn: feat.name,
    };
  });
  leaves.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return FEAT_CATEGORIES
    .map((id) => ({ id, label: FEAT_CATEGORY_DE[id], leaves: leaves.filter((l) => l.groupId === id) }))
    .filter((g) => g.leaves.length);
}

export const GROUPED_SECTIONS: GroupedSection[] = [
  {
    kind: 'monster', type: 'monster', label: 'Monster', addTitle: 'Neues Monster',
    emptyLabel: 'Keine Monster', searchable: true, catalog: 'monster',
    loadGroups: loadMonsterGroups,
  },
  {
    kind: 'spell', type: 'spell', label: 'Zauber', addTitle: 'Neuer Zauber',
    emptyLabel: 'Keine Zauber', searchable: true, catalog: 'spell-school',
    altMode: { primaryLabel: 'Schule', label: 'Grad', build: spellsByLevel, catalog: 'spell-level' },
    loadGroups: async () =>
      (await listSubdirs(SPELLS_PATH).catch(() => [])).map((school) => ({
        id: school,
        label: schoolDirLabel(school),
        color: schoolColor(school),
      })),
    loadLeaves: loadSpellLeaves,
  },
  {
    kind: 'item', type: 'item', label: 'Gegenstände', addTitle: 'Neuer Gegenstand',
    emptyLabel: 'Keine Gegenstände', searchable: true, catalog: 'item',
    headerClass: 'item-group-header',
    loadGroups: async () => (await listItemDirs()).map((dir) => ({ id: dir, label: itemDirLabel(dir) })),
    loadLeaves: loadItemLeaves,
    invalidate: invalidateItemCache,
  },
  {
    kind: 'feat', type: 'feat', label: 'Talente', addTitle: 'Neues Talent',
    emptyLabel: 'Keine Talente', searchable: true, catalog: 'feat',
    loadGroups: loadFeatGroups,
    invalidate: invalidateFeatsCache,
  },
];

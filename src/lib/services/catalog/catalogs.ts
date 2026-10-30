/** Monster- und Gegenstands-Katalog. Die Gruppe ist jeweils der Filter, keine eigene Spalte. */
import { getMonsterLibrary, invalidateMonsterLibrary } from '../../monsterLibrary';
import { getAllItemsByDir, invalidateItemCache, type ItemInfo } from '../../itemLibrary';
import { CATEGORY_LABELS, DIR_TO_CATEGORY, RARITY_LABELS, rarityColor } from '../../itemLabels';
import { formatCost } from '../../itemFormat';
import { itemInfoArtUrl, monsterArtUrl } from '../../libraryArt';
import { monsterSizeLabel, monsterTypeLabel } from '../../types';
import { MONSTER_SIZE_KEYS } from '../../schemas/vocabulary';
import { sourceLabel } from '../../schemas/source';
import { crLabel } from '../monsterFormat';
import type { CatalogCell, CatalogGroup, CatalogKind, CatalogSpec } from './catalogTypes';

const byLabel = (a: CatalogGroup, b: CatalogGroup) => a.label.localeCompare(b.label, 'de');

const sourceCell = (source: string | undefined): CatalogCell => ({ text: sourceLabel(source) || '—' });

const monsterCatalog: CatalogSpec = {
  kind: 'monster',
  type: 'monster',
  label: 'Monster',
  groupLabel: 'Typ',
  columns: [
    { label: 'HG', numeric: true },
    { label: 'Größe' },
    { label: 'RK', numeric: true },
    { label: 'TP', numeric: true },
    { label: 'Quelle' },
  ],
  invalidate: invalidateMonsterLibrary,
  async load() {
    const hits = await getMonsterLibrary();
    const rows = hits.map(({ slug, path, monster: m }) => ({
      path,
      entryName: slug,
      name: m.name || slug,
      altName: m.name_en,
      group: m.type,
      icon: monsterArtUrl(m),
      iconColor: 'var(--red)',
      cells: [
        { text: crLabel(m.challenge_rating), sort: m.challenge_rating },
        { text: monsterSizeLabel(m.size), sort: MONSTER_SIZE_KEYS.indexOf(m.size) },
        { text: String(m.armor_class), sort: m.armor_class },
        { text: String(m.hit_points), sort: m.hit_points },
        sourceCell(m.source),
      ],
    }));
    const types = [...new Set(rows.map((r) => r.group))];
    return { rows, groups: types.map((id) => ({ id, label: monsterTypeLabel(id) })).sort(byLabel) };
  },
};

/** `ItemInfo.rarity` trägt je nach Datei den String oder das `{ name }`-Objekt des Schemas. */
const rarityName = (rarity: unknown): string =>
  typeof rarity === 'string' ? rarity : ((rarity as { name?: string } | null)?.name ?? '');

const RARITY_ORDER = Object.keys(RARITY_LABELS);

const COPPER_PER_UNIT: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

function itemCells(item: ItemInfo): CatalogCell[] {
  const rarity = rarityName(item.rarity);
  return [
    {
      text: RARITY_LABELS[rarity] ?? '—',
      sort: RARITY_ORDER.includes(rarity) ? RARITY_ORDER.indexOf(rarity) : -1,
      color: RARITY_LABELS[rarity] ? rarityColor(rarity) : undefined,
    },
    { text: item.attunement ? 'ja' : '', sort: item.attunement ? 1 : 0 },
    {
      text: item.cost ? formatCost(item.cost) : '—',
      sort: item.cost ? item.cost.quantity * (COPPER_PER_UNIT[item.cost.unit] ?? 1) : -1,
    },
    { text: item.weight != null ? `${item.weight} Pfd.` : '—', sort: item.weight ?? -1 },
    sourceCell(item.source),
  ];
}

/** Legacy-Ordner (z.B. „wondrous-items") mit auflösen. */
export const itemDirLabel = (dir: string): string => CATEGORY_LABELS[DIR_TO_CATEGORY[dir] ?? dir] ?? dir;

const itemCatalog: CatalogSpec = {
  kind: 'item',
  type: 'item',
  label: 'Gegenstände',
  groupLabel: 'Kategorie',
  columns: [
    { label: 'Seltenheit' },
    { label: 'Einst.' },
    { label: 'Preis', numeric: true },
    { label: 'Gewicht', numeric: true },
    { label: 'Quelle' },
  ],
  invalidate: () => invalidateItemCache(),
  async load() {
    const byDir = await getAllItemsByDir();
    const rows = Object.entries(byDir).flatMap(([dir, items]) =>
      items.map((item) => ({
        path: item.path,
        entryName: item.path.slice(item.path.lastIndexOf('/') + 1).replace('.json', ''),
        name: item.name_de ?? item.name,
        altName: item.name,
        group: dir,
        icon: itemInfoArtUrl(item),
        iconColor: rarityColor(item.rarity),
        cells: itemCells(item),
      })),
    );
    return { rows, groups: Object.keys(byDir).map((id) => ({ id, label: itemDirLabel(id) })).sort(byLabel) };
  },
};

export const CATALOGS: Record<CatalogKind, CatalogSpec> = { monster: monsterCatalog, item: itemCatalog };

import { getAllItemsByDir, invalidateItemCache, type ItemInfo } from '../../itemLibrary';
import {
  ARMOR_CATEGORY_LABELS, CATEGORY_LABELS, DIR_TO_CATEGORY, PROPERTY_LABELS, RARITY_LABELS,
  WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, rarityColor,
} from '../../itemLabels';
import { formatCost, weaponDamageLine } from '../../itemFormat';
import { itemInfoArtUrl } from '../../libraryArt';
import { byLabel, sourceFacet, type CatalogCell, type CatalogFacetValue, type CatalogSpec } from './catalogTypes';

/** Legacy-Ordner (z.B. „wondrous-items") mit auflösen. */
export const itemDirLabel = (dir: string): string => CATEGORY_LABELS[DIR_TO_CATEGORY[dir] ?? dir] ?? dir;

/** `ItemInfo.rarity` trägt je nach Datei den String oder das `{ name }`-Objekt des Schemas. */
const rarityName = (rarity: unknown): string =>
  typeof rarity === 'string' ? rarity : ((rarity as { name?: string } | null)?.name ?? '');

const RARITY_ORDER = Object.keys(RARITY_LABELS);

const COPPER_PER_UNIT: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

const ARMOR_ORDER = Object.keys(ARMOR_CATEGORY_LABELS);

const EMPTY: CatalogCell = { text: '—', sort: -1 };

/** Durchschnittswurf, damit 2W6 hinter 1W12 sortiert. */
function averageDamage(dice: string): number {
  const m = dice.match(/(\d*)d(\d+)/i);
  return m ? Number(m[1] || 1) * (Number(m[2]) + 1) / 2 : Number(dice) || 0;
}

function armorClassCell(item: ItemInfo): CatalogCell {
  const ac = item.armor_class;
  if (!ac) return EMPTY;
  if (item.armor_category === 'Shield') return { text: `+${ac.base}`, sort: ac.base };
  const dex = ac.dex_bonus ? ` + GES${ac.max_bonus != null ? ` (max. ${ac.max_bonus})` : ''}` : '';
  return { text: `${ac.base}${dex}`, sort: ac.base };
}

/**
 * Ein magischer Gegenstand ohne Seltenheit hat keine feste: beim Zaubergebundenen hängt sie am
 * eingebundenen Zauber. Nicht-Magisches hat gar keine — ein Wert hieße dort etwas Falsches.
 */
const VARIES: CatalogFacetValue = { id: 'varies', label: 'Variiert', order: RARITY_ORDER.length };

function rarityFacet(item: ItemInfo): CatalogFacetValue | undefined {
  const rarity = rarityName(item.rarity);
  if (RARITY_LABELS[rarity]) return { id: rarity, label: RARITY_LABELS[rarity], order: RARITY_ORDER.indexOf(rarity) };
  return item.magic ? VARIES : undefined;
}

function rarityCell(item: ItemInfo): CatalogCell {
  const facet = rarityFacet(item);
  if (!facet) return { text: '', sort: -1 };
  return facet === VARIES
    ? { text: 'variiert', sort: facet.order, color: 'var(--ink-faint)' }
    : { text: facet.label, sort: facet.order, color: rarityColor(facet.id) };
}

const MAGIC_FACET: CatalogFacetValue = { id: 'magic', label: 'Magisch' };
const MUNDANE_FACET: CatalogFacetValue = { id: 'mundane', label: 'Nicht magisch', order: -1 };

function itemCells(item: ItemInfo): Record<string, CatalogCell> {
  return {
    rarity: rarityCell(item),
    attunement: item.attunement ? { text: '✓', sort: 1, color: 'var(--arcane)' } : { text: '', sort: 0 },
    cost: item.cost
      ? { text: formatCost(item.cost), sort: item.cost.quantity * (COPPER_PER_UNIT[item.cost.unit] ?? 1) }
      : EMPTY,
    weight: item.weight != null ? { text: `${item.weight} Pfd.`, sort: item.weight } : EMPTY,
    weaponCategory: { text: WEAPON_CATEGORY_LABELS[item.weapon_category ?? ''] ?? '' },
    weaponRange: { text: WEAPON_RANGE_LABELS[item.weapon_range ?? ''] ?? '' },
    damage: item.damage
      ? { text: weaponDamageLine(item), sort: averageDamage(item.damage.damage_dice) }
      : EMPTY,
    properties: { text: (item.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ') },
    armorKind: item.armor_category
      ? { text: ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category, sort: ARMOR_ORDER.indexOf(item.armor_category) }
      : EMPTY,
    ac: armorClassCell(item),
    strength: item.str_minimum ? { text: `mind. ${item.str_minimum}`, sort: item.str_minimum } : { text: '', sort: 0 },
    stealth: { text: item.stealth_disadvantage ? 'Nachteil' : '', sort: item.stealth_disadvantage ? 1 : 0 },
  };
}

const MAGIC = ['rarity', 'attunement'];
const MUNDANE = ['cost', 'weight'];

export const itemCatalog: CatalogSpec = {
  kind: 'item',
  type: 'item',
  label: 'Gegenstände',
  groupLabel: 'Kategorie',
  columns: {
    rarity: { label: 'Seltenheit' },
    attunement: { label: 'Einst.', center: true },
    cost: { label: 'Preis', numeric: true },
    weight: { label: 'Gewicht', numeric: true },
    weaponCategory: { label: 'Art' },
    weaponRange: { label: 'Kampf' },
    damage: { label: 'Schaden' },
    properties: { label: 'Eigenschaften', wrap: true },
    armorKind: { label: 'Art' },
    ac: { label: 'RK' },
    strength: { label: 'Stärke' },
    stealth: { label: 'Heimlichkeit' },
  },
  columnSets: {
    '': ['rarity', 'attunement', 'cost', 'weight'],
    weapon: ['weaponCategory', 'weaponRange', 'damage', 'properties', 'rarity', 'cost', 'weight'],
    armor: ['armorKind', 'ac', 'strength', 'stealth', 'rarity', 'cost', 'weight'],
    potion: MAGIC, ring: MAGIC, rod: MAGIC, scroll: MAGIC, staff: MAGIC, wand: MAGIC, 'wondrous-item': MAGIC,
    'adventuring-gear': MUNDANE, tools: MUNDANE, 'equipment-pack': MUNDANE, 'spellcasting-focus': MUNDANE,
    mount: MUNDANE, 'land-vehicle': MUNDANE, 'waterborne-vehicle': MUNDANE, 'airborne-vehicle': MUNDANE,
  },
  facets: { magic: 'Magie', rarity: 'Seltenheit', source: 'Quelle' },
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
        facets: {
          magic: item.magic ? MAGIC_FACET : MUNDANE_FACET,
          rarity: rarityFacet(item),
          source: sourceFacet(item.source),
        },
      })),
    );
    return { rows, groups: Object.keys(byDir).map((id) => ({ id, label: itemDirLabel(id) })).sort(byLabel) };
  },
};

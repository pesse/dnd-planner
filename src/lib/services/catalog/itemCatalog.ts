import { getAllItemsByDir, invalidateItemCache, type ItemInfo } from '../../itemLibrary';
import {
  ARMOR_CATEGORY_LABELS, CATEGORY_LABELS, DIR_TO_CATEGORY, PROPERTY_LABELS, RARITY_LABELS,
  WEAPON_CATEGORY_LABELS, WEAPON_RANGE_LABELS, masteryLabel, rarityColor,
} from '../../itemLabels';
import { formatCost, weaponDamageLine } from '../../itemFormat';
import { itemInfoArtUrl } from '../../libraryArt';
import { byLabel, sourceCell, type CatalogCell, type CatalogSpec } from './catalogTypes';

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

function itemCells(item: ItemInfo): Record<string, CatalogCell> {
  const rarity = rarityName(item.rarity);
  const kind = [
    WEAPON_CATEGORY_LABELS[item.weapon_category ?? ''] ?? '',
    WEAPON_RANGE_LABELS[item.weapon_range ?? ''] ?? '',
  ].filter(Boolean).join(', ');
  return {
    rarity: RARITY_LABELS[rarity]
      ? { text: RARITY_LABELS[rarity], sort: RARITY_ORDER.indexOf(rarity), color: rarityColor(rarity) }
      : EMPTY,
    attunement: { text: item.attunement ? 'ja' : '', sort: item.attunement ? 1 : 0 },
    cost: item.cost
      ? { text: formatCost(item.cost), sort: item.cost.quantity * (COPPER_PER_UNIT[item.cost.unit] ?? 1) }
      : EMPTY,
    weight: item.weight != null ? { text: `${item.weight} Pfd.`, sort: item.weight } : EMPTY,
    source: sourceCell(item.source),
    weaponKind: kind ? { text: kind } : EMPTY,
    damage: item.damage
      ? { text: weaponDamageLine(item), sort: averageDamage(item.damage.damage_dice) }
      : EMPTY,
    properties: { text: (item.properties ?? []).map((p) => PROPERTY_LABELS[p.index] ?? p.name).join(', ') },
    mastery: { text: item.mastery ? masteryLabel(item.mastery) : '' },
    armorKind: item.armor_category
      ? { text: ARMOR_CATEGORY_LABELS[item.armor_category] ?? item.armor_category, sort: ARMOR_ORDER.indexOf(item.armor_category) }
      : EMPTY,
    ac: armorClassCell(item),
    strength: item.str_minimum ? { text: `mind. ${item.str_minimum}`, sort: item.str_minimum } : { text: '', sort: 0 },
    stealth: { text: item.stealth_disadvantage ? 'Nachteil' : '', sort: item.stealth_disadvantage ? 1 : 0 },
  };
}

const MAGIC = ['rarity', 'attunement', 'source'];
const MUNDANE = ['cost', 'weight', 'source'];

export const itemCatalog: CatalogSpec = {
  kind: 'item',
  type: 'item',
  label: 'Gegenstände',
  groupLabel: 'Kategorie',
  columns: {
    rarity: { label: 'Seltenheit' },
    attunement: { label: 'Einst.' },
    cost: { label: 'Preis', numeric: true },
    weight: { label: 'Gewicht', numeric: true },
    source: { label: 'Quelle' },
    weaponKind: { label: 'Art' },
    damage: { label: 'Schaden' },
    properties: { label: 'Eigenschaften', wrap: true },
    mastery: { label: 'Meisterschaft' },
    armorKind: { label: 'Art' },
    ac: { label: 'RK' },
    strength: { label: 'Stärke' },
    stealth: { label: 'Heimlichkeit' },
  },
  columnSets: {
    '': ['rarity', 'attunement', 'cost', 'weight', 'source'],
    weapon: ['weaponKind', 'damage', 'properties', 'mastery', 'rarity', 'cost', 'weight', 'source'],
    armor: ['armorKind', 'ac', 'strength', 'stealth', 'rarity', 'cost', 'weight', 'source'],
    potion: MAGIC, ring: MAGIC, rod: MAGIC, scroll: MAGIC, staff: MAGIC, wand: MAGIC, 'wondrous-item': MAGIC,
    'adventuring-gear': MUNDANE, tools: MUNDANE, 'equipment-pack': MUNDANE, 'spellcasting-focus': MUNDANE,
    mount: MUNDANE, 'land-vehicle': MUNDANE, 'waterborne-vehicle': MUNDANE,
  },
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

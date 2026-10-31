/**
 * Legt fehlende Talente und Gegenstände aus D&D Beyond als Vault-Einträge an. Englischer Text
 * aus D&D Beyond, kein `grants`: das Feld fehlt bewusst, damit die KI-Analyse sie aufgreift.
 */
import { invoke } from '@tauri-apps/api/core';
import { featSchema, type Feat } from '$lib/schemas/feat';
import { itemKeyOf, itemSchema, type Item } from '$lib/schemas/item';
import type { DdbFeature, DdbItem, DdbItemDetail } from '$lib/schemas/ddbSheet';
import { isImportSource, type SourceKey } from '$lib/schemas/source';
import { FEATS_PATH } from '$lib/featsLibrary';
import { ITEMS_PATH } from '$lib/itemLibrary';
import { slugAscii } from '$lib/utils/text';

const ARMOR_CATEGORIES: Record<number, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy', 4: 'Shield' };
const SHIELD = 4;
const MARTIAL = 2;

const FILTER_TO_CATEGORY: Record<string, string> = {
  weapon: 'weapon', potion: 'potion', ring: 'ring', rod: 'rod', staff: 'staff', wand: 'wand',
  scroll: 'scroll', 'wondrous item': 'wondrous-item',
};

export function itemCategory(d: DdbItemDetail | null): string {
  if (!d) return 'adventuring-gear';
  if (d.filterType.toLowerCase() === 'armor') return d.armorTypeId === SHIELD ? 'shield' : 'armor';
  if (/ammunition/i.test(d.type)) return 'ammunition';
  if (/focus/i.test(d.type)) return 'spellcasting-focus';
  if (/tool|supplies|kit/i.test(d.type)) return 'tools';
  return FILTER_TO_CATEGORY[d.filterType.toLowerCase()] ?? 'adventuring-gear';
}

const documentOf = (source: SourceKey) => ({ key: source, gamesystem: '' });

export function featFromDdb(f: DdbFeature, source: SourceKey): Feat {
  const name = f.name.replace(/\s*\(.*\)\s*$/, '');
  return featSchema.parse({
    key: `${source}_${slugAscii(name)}`,
    source,
    name,
    desc: f.origin?.desc ?? '',
    document: documentOf(source),
  });
}

function weaponFields(d: DdbItemDetail): Partial<Item> {
  if (!d.damage) return {};
  return {
    weapon_category: d.weaponCategoryId === MARTIAL ? 'Martial' : 'Simple',
    weapon_range: d.ranged ? 'Ranged' : 'Melee',
    damage: { damage_dice: d.damage, damage_type: { index: d.damageType.toLowerCase(), name: d.damageType } },
    properties: d.properties.map((p) => ({ index: slugAscii(p), name: p })),
  };
}

function armorFields(d: DdbItemDetail): Partial<Item> {
  if (d.armorClass === null || d.armorTypeId === null) return {};
  return {
    armor_category: ARMOR_CATEGORIES[d.armorTypeId] ?? '',
    armor_class: { base: d.armorClass, dex_bonus: d.armorTypeId === 1 || d.armorTypeId === 2, max_bonus: d.armorTypeId === 2 ? 2 : null },
    ...(d.stealthDisadvantage ? { stealth_disadvantage: true } : {}),
    ...(d.strengthRequirement ? { str_minimum: d.strengthRequirement } : {}),
  };
}

export function itemFromDdb(it: DdbItem, source: SourceKey): Item {
  const d = it.detail;
  const category = itemCategory(d);
  const raw: Record<string, unknown> = {
    name: it.name,
    equipment_category: { index: category, name: category.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') },
    desc: it.origin.desc.split(/\n{2,}/).filter(Boolean),
    weight: d?.weightLb ?? (it.qty && it.totalWeightLb !== null ? it.totalWeightLb / it.qty : null),
    source,
    document: documentOf(source),
    ...(d?.costGp ? { cost: { quantity: d.costGp, unit: 'gp' } } : {}),
    ...(d?.magic && d.rarity ? { rarity: { name: d.rarity } } : {}),
    ...(d?.attunement ? { attunement: true, ...(d.attunement !== 'yes' ? { attunement_by: d.attunement } : {}) } : {}),
    ...(d ? weaponFields(d) : {}),
    ...(d && (category === 'armor' || category === 'shield') ? armorFields(d) : {}),
  };
  raw.key = itemKeyOf(raw);
  return itemSchema.parse(raw);
}

/**
 * Buchinhalte tragen die Herkunft im Dateinamen (`dark-bargain.crooked-moon-import.json`):
 * daran hält das `.gitignore` des Vaults sie aus dem Repo, so wie `build_packs.py` aus den Packs.
 */
async function freeFileName(dir: string, base: string, source: SourceKey): Promise<string> {
  if (isImportSource(source)) return `${base}.${source}`;
  const taken = await invoke<{ name: string }[]>('list_json_entries', { path: dir })
    .then((es) => new Set(es.map((e) => e.name)))
    .catch(() => new Set<string>());
  return taken.has(`${base}.json`) ? `${base}-${source}` : base;
}

/** Talente liegen flach unter `vault/feats/<englischer-slug>.json`. */
export async function writeImportedFeat(feat: Feat): Promise<string> {
  const name = await freeFileName(FEATS_PATH, slugAscii(feat.name), feat.source);
  const path = `${FEATS_PATH}/${name}.json`;
  await invoke('write_file_content', { path, content: JSON.stringify(feat, null, 2) });
  return path;
}

export async function writeImportedItem(item: Item): Promise<string> {
  const dir = `${ITEMS_PATH}/${item.equipment_category.index}`;
  const name = await freeFileName(dir, slugAscii(item.name), item.source);
  const path = `${dir}/${name}.json`;
  await invoke('write_file_content', { path, content: JSON.stringify(item, null, 2) });
  return path;
}

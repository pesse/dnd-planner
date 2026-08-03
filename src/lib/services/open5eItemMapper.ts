/**
 * Rohes Open5e-v2-Item → internes `Item`-Schema. Bewusst OHNE `invoke`, damit der
 * Node-Importer (`scripts/import-open5e-items.mts`) die Funktion direkt importieren kann.
 */
import type { Item } from '../schemas/item';
import { WEAPON_MASTERIES } from '../schemas/vocabulary';
import { keySlug, slugAscii } from '$lib/utils/text';
import { firstInt, numOr } from '$lib/utils/num';
import { capitalize, DEFAULT_DOCUMENT, descToParagraphs } from './open5eSource';

interface Open5eWeapon {
  key?: string;
  damage_dice?: string;
  damage_type?: { key: string; name: string };
  properties?: Array<{ property?: { name?: string; type?: string | null }; detail?: string | null }>;
  is_simple?: boolean;
  is_martial?: boolean;
}

interface Open5eArmor {
  key?: string;
  category?: string;
  ac_base?: number;
  ac_add_dexmod?: boolean;
  ac_cap_dexmod?: number | null;
  grants_stealth_disadvantage?: boolean;
  strength_score_required?: number | null;
}



/** Open5e liefert die Kosten als Dezimal-gp-String; 0/leer heißt „kein Preis". */
function parseOpen5eCost(raw: unknown): Item['cost'] | undefined {
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (!isFinite(n) || n <= 0) return undefined;
  if (n >= 1) return { quantity: Math.round(n * 100) / 100, unit: 'gp' };
  const sp = n * 10;
  if (Math.abs(sp - Math.round(sp)) < 1e-9 && sp >= 1) return { quantity: Math.round(sp), unit: 'sp' };
  return { quantity: Math.round(n * 100), unit: 'cp' };
}

/** Eingabeform ist Prosa: "Range 150/600; Arrow"; ein Einzelwert wird zu normal=long. */
function parseRangePair(detail: string | null | undefined): { normal: number; long: number } | undefined {
  if (!detail) return undefined;
  const pair = detail.match(/(\d+)\s*\/\s*(\d+)/);
  if (pair) return { normal: Number(pair[1]), long: Number(pair[2]) };
  const single = detail.match(/(\d+)/);
  return single ? { normal: Number(single[1]), long: Number(single[1]) } : undefined;
}

/** Best effort aus dem Namen — Open5e führt den Bonus in keinem eigenen Feld. */
function magicBonusFromName(name: string): number | undefined {
  const m = name.match(/\+([123])\b/);
  return m ? Number(m[1]) : undefined;
}

function applyWeapon(item: Item, w: Open5eWeapon): void {
  const wc = w.is_martial ? 'Martial' : w.is_simple ? 'Simple' : undefined;
  if (wc) item.weapon_category = wc;
  if (w.damage_dice && w.damage_type) {
    item.damage = { damage_dice: w.damage_dice, damage_type: { index: w.damage_type.key, name: w.damage_type.name } };
  }
  const props: NonNullable<Item['properties']> = [];
  let ranged = false;
  for (const p of w.properties ?? []) {
    const name = p.property?.name ?? '';
    if (!name) continue;
    // Meisterschaft kommt als Eigenschaft mit type "Mastery" — sie gehört ins eigene
    // `mastery`-Feld, NICHT in properties (dort sucht sie niemand).
    if (p.property?.type === 'Mastery') {
      if ((WEAPON_MASTERIES as readonly string[]).includes(name)) item.mastery = name as Item['mastery'];
      continue;
    }
    props.push({ index: slugAscii(name), name });
    if (name === 'Versatile' && p.detail && item.damage) {
      item.two_handed_damage = { damage_dice: p.detail, damage_type: item.damage.damage_type };
    }
    if (name === 'Ammunition') {
      ranged = true;
      const r = parseRangePair(p.detail);
      if (r) item.range = r;
    }
    if (name === 'Thrown') {
      const r = parseRangePair(p.detail);
      if (r) item.throw_range = r;
    }
  }
  if (props.length) item.properties = props;
  item.weapon_range = ranged ? 'Ranged' : 'Melee';
}

function applyArmor(item: Item, a: Open5eArmor): void {
  // Open5e labelt Schilde fälschlich als armor.category "heavy"; verlässliches Signal
  // ist der kleine Flat-AC-Bonus (ac_base < 10) statt eines Rüstungs-Grundwerts (≥10).
  const isShield = typeof a.ac_base === 'number' && a.ac_base < 10;
  const cat = isShield ? 'Shield' : capitalize(String(a.category ?? ''));
  if (cat) item.armor_category = cat;
  if (typeof a.ac_base === 'number') {
    item.armor_class = { base: a.ac_base, dex_bonus: Boolean(a.ac_add_dexmod), max_bonus: a.ac_cap_dexmod ?? null };
  }
  item.str_minimum = a.strength_score_required ?? 0;
  item.stealth_disadvantage = Boolean(a.grants_stealth_disadvantage);
}

/** `name_de`/`desc_de` bleiben ungesetzt — Open5e ist englisch, DE wird separat gepflegt. */
export function mapOpen5eItem(raw: Record<string, unknown>): Item {
  const doc = raw.document as { key?: string; gamesystem?: { key?: string } } | undefined;
  const category = raw.category as { key?: string; name?: string } | undefined;
  const weapon = raw.weapon as Open5eWeapon | null | undefined;
  const armor = raw.armor as Open5eArmor | null | undefined;
  const key = String(raw.key ?? '');
  const baseKey = weapon?.key ?? armor?.key ?? key;

  const item: Item = {
    key,
    index: keySlug(baseKey),
    name: String(raw.name ?? ''),
    equipment_category: {
      index: String(category?.key ?? 'adventuring-gear'),
      name: String(category?.name ?? 'Adventuring Gear'),
    },
    desc: descToParagraphs(raw.desc),
    source: (doc?.key ?? DEFAULT_DOCUMENT) as Item['source'],
    document: { key: doc?.key ?? '', gamesystem: doc?.gamesystem?.key ?? '' },
  };

  const cost = parseOpen5eCost(raw.cost);
  if (cost) item.cost = cost;
  const weight = parseFloat(String(raw.weight ?? ''));
  if (isFinite(weight) && weight > 0) item.weight = weight;

  const rarity = raw.rarity as { name?: string; rank?: number } | undefined;
  if (rarity?.name) item.rarity = { name: rarity.name, rank: rarity.rank };
  if ('requires_attunement' in raw) item.attunement = Boolean(raw.requires_attunement);
  if (raw.attunement_detail) item.attunement_by = String(raw.attunement_detail);
  const bonus = magicBonusFromName(item.name);
  if (bonus) item.magic_bonus = bonus;

  if (weapon) applyWeapon(item, weapon);
  if (armor) applyArmor(item, armor);

  return item;
}

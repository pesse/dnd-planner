/**
 * Single Source of Truth für Gegenstände: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema (siehe llmJson.ts). Lehnt sich ans Open5e-v2-Schema an (`/v2/items/`),
 * adaptiert dessen inline weapon/armor-Detailobjekte in flache Felder (siehe open5eApi.ts).
 */
import { z } from 'zod';
import { slugAscii } from '../utils/text';
import { namedRef } from './llmJson';
import { sourceField, migrateSourceLegacy, OWN_SOURCE } from './source';
import { WEAPON_MASTERIES } from './vocabulary';

const damageSchema = z.object({
  damage_dice: z.string().describe('z.B. "1d8".'),
  damage_type: namedRef(),
});

export const itemSchema = z.object({
  key: z.string().default('').describe('Identität ({source}_{slug}, z.B. "srd-2024_battleaxe"), leer bei Neuanlage.'),
  index: z.string().optional().describe('Open5e-v2-Basis-Slug (z.B. "warhammer"), leer bei freiem Homebrew.'),
  name: z.string().describe('Originalname (Englisch).'),
  name_de: z.string().optional().describe('Deutscher Name.'),
  equipment_category: namedRef().describe(
    'Kategorie als {index, name} im Open5e-v2-Format — die EINZIGE Typ-Quelle. ' +
      'index ist einer von: adventuring-gear, ammunition, armor, art, equipment-pack, gem, jewelry, ' +
      'land-vehicle, mount, poison, potion, ring, rod, scroll, service, shield, spellcasting-focus, ' +
      'staff, tools, trade-good, wand, waterborne-vehicle, weapon, wondrous-item. ' +
      'Eine magische Waffe bleibt "weapon"; Magie wird über rarity/attunement/magic_bonus ausgedrückt, NICHT über die Kategorie.',
  ),
  rarity: z
    .object({
      name: z.string().describe('z.B. Uncommon, Rare, Very Rare, Legendary'),
      rank: z.number().int().optional().describe('Numerische Ordnung (Common=1 … Artifact=6), aus Open5e.'),
    })
    .optional(),
  attunement: z.boolean().optional(),
  attunement_by: z.string().nullable().optional(),
  variant: z.boolean().optional(),
  variants: z.array(z.string()).optional(),
  weapon_category: z.string().optional().describe('Simple | Martial'),
  weapon_range: z.string().optional().describe('Melee | Ranged'),
  damage: damageSchema.optional(),
  two_handed_damage: damageSchema.optional(),
  range: z.object({ normal: z.number(), long: z.number().nullable().optional() }).optional(),
  throw_range: z.object({ normal: z.number(), long: z.number() }).optional(),
  properties: z.array(namedRef()).optional(),
  mastery: z
    .enum(WEAPON_MASTERIES)
    .optional()
    .describe(
      'Meisterschaftseigenschaft der Waffe (5e 2024): genau eine je Waffenart. Nur bei Waffen setzen, sonst weglassen.',
    ),
  magic_bonus: z
    .number()
    .int()
    .optional()
    .describe('Magischer Bonus auf Angriffs- UND Schadenswürfe (z.B. 1, 2, 3). Nur für magische Waffen; sonst weglassen.'),
  armor_category: z.string().optional().describe('Light | Medium | Heavy | Shield'),
  armor_class: z
    .object({ base: z.number().int(), dex_bonus: z.boolean(), max_bonus: z.number().int().nullable() })
    .optional(),
  str_minimum: z.number().int().optional(),
  stealth_disadvantage: z.boolean().optional(),
  desc: z.array(z.string()).default([]).describe('Beschreibung (Englisch), je Absatz ein Eintrag.'),
  desc_de: z.array(z.string()).optional().describe('Beschreibung (Deutsch).'),
  cost: z
    .object({ quantity: z.number(), unit: z.string().describe('gp | sp | cp | ep | pp') })
    .optional(),
  weight: z.number().nullable().optional().describe('in lbs.'),
  source: sourceField(),
  document: z
    .object({ key: z.string().default(''), gamesystem: z.string().default('') })
    .default({ key: '', gamesystem: '' }),
});

export type Item = z.infer<typeof itemSchema>;

/** Großschreibung je Wort für einen Slug („wondrous-item" → „Wondrous Item"). */
function titleizeSlug(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Identität eines Items, auch ohne `key` in der Datei (Homebrew, Altbestand). MUSS von
 * jedem Leser benutzt werden, der Items identifiziert: sonst vergibt der Index, der die
 * Rohdatei ohne Schema liest, eine andere Identität als die migrierte Datei trägt.
 */
export function itemKeyOf(raw: Record<string, unknown>): string {
  if (typeof raw.key === 'string' && raw.key) return raw.key;
  // Herkunft erst normalisieren: „homebrew" ergäbe sonst einen anderen Key als migriert.
  const migrated = migrateSourceLegacy({ ...raw });
  const source = typeof migrated.source === 'string' && migrated.source ? migrated.source : OWN_SOURCE;
  const name = typeof raw.name === 'string' ? raw.name : '';
  return name ? `${source}_${slugAscii(name)}` : '';
}

/**
 * Alt-Kategorien (dnd5eapi/2014) auf das Open5e-v2-Vokabular. Fängt unangetasteten
 * Homebrew-Bestand beim Laden ab, ohne die Dateien zu verschieben.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  'wondrous-items': 'wondrous-item',
  'mounts-and-vehicles': 'mount',
  shields: 'shield',
};

/**
 * Migriert Altformat-Felder, sorgt für ein vorhandenes `equipment_category` (die einzige
 * Typ-Quelle) und entfernt das abgelöste `item_type`. Idempotent.
 */
export function migrateItemLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const r = { ...(raw as Record<string, unknown>) };

  if (typeof r.rarity === 'string') r.rarity = { name: r.rarity };
  if (!r.desc && typeof r.description === 'string') {
    r.desc = r.description ? [r.description as string] : [];
    delete r.description;
  }
  if (!r.equipment_category && typeof r.category === 'string') {
    r.equipment_category = { index: r.category, name: r.category };
    delete r.category;
  }
  if ('attunement_requirements' in r && !('attunement_by' in r)) {
    r.attunement_by = r.attunement_requirements ?? null;
    delete r.attunement_requirements;
  }
  if (!Array.isArray(r.desc)) r.desc = [];
  delete r.url; // dnd5eapi-Relikt, unter Open5e bedeutungslos

  // equipment_category ist die einzige Typ-Quelle. Fehlt sie (Altbestand), aus den
  // vorhandenen Feldern bzw. dem abgelösten item_type ableiten.
  const hasCat = !!(r.equipment_category as { index?: string } | undefined)?.index;
  if (!hasCat) {
    let idx: string;
    if (r.weapon_category || r.damage) idx = 'weapon';
    else if (r.armor_category || r.armor_class) idx = 'armor';
    else if (r.item_type === 'weapon') idx = 'weapon';
    else if (r.item_type === 'armor') idx = 'armor';
    else if (r.item_type === 'magic' || r.rarity) idx = 'wondrous-item';
    else idx = 'adventuring-gear';
    r.equipment_category = { index: idx, name: titleizeSlug(idx) };
  }
  delete r.item_type;

  // Alt-Kategorievokabular (dnd5eapi) → Open5e v2.
  const ec = r.equipment_category as { index?: string; name?: string } | undefined;
  if (ec?.index && CATEGORY_ALIASES[ec.index]) {
    ec.index = CATEGORY_ALIASES[ec.index];
    ec.name = titleizeSlug(ec.index);
  }

  const migrated = migrateSourceLegacy(r);

  // `key` + `document` backfillen, damit auch Altbestand/Homebrew das einheitliche
  // Identitäts-/Herkunftsmodell trägt (source === document.key). Der Importer setzt
  // beides für SRD-Items explizit; hier greift nur, was noch keins hat.
  const source = typeof migrated.source === 'string' && migrated.source ? migrated.source : OWN_SOURCE;
  migrated.key = itemKeyOf(migrated);
  const doc = migrated.document as { key?: string; gamesystem?: string } | undefined;
  if (!doc || typeof doc !== 'object') migrated.document = { key: source, gamesystem: '' };
  else if (!doc.key) doc.key = source;

  return migrated;
}

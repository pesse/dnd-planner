/**
 * Single Source of Truth für Gegenstände: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema (siehe shared.ts). Lehnt sich ans DnD-API-Schema an.
 */
import { z } from 'zod';
import { namedRef } from './shared';

const damageSchema = z.object({
  damage_dice: z.string().describe('z.B. "1d8".'),
  damage_type: namedRef(),
});

export const itemSchema = z.object({
  index: z.string().optional().describe('API-Slug der Basis (z.B. "warhammer"), leer bei Homebrew.'),
  name: z.string().describe('Originalname (Englisch).'),
  name_de: z.string().optional().describe('Deutscher Name.'),
  equipment_category: namedRef().describe(
    'Kategorie als {index, name} im DnD-API-Format — die EINZIGE Typ-Quelle. ' +
      'index ist einer von: weapon, armor, ammunition, adventuring-gear, tools, mounts-and-vehicles, ' +
      'ring, rod, staff, wand, scroll, potion, wondrous-items. ' +
      'Eine magische Waffe bleibt "weapon"; Magie wird über rarity/attunement/magic_bonus ausgedrückt, NICHT über die Kategorie.',
  ),
  rarity: z
    .object({ name: z.string().describe('z.B. Uncommon, Rare, Very Rare, Legendary') })
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
  source: z.string().default('Homebrew').describe('Herkunft, z.B. "KI", "SRD", "Homebrew".'),
  url: z.string().optional(),
});

export type Item = z.infer<typeof itemSchema>;

/** Großschreibung je Wort für einen Slug („wondrous-items" → „Wondrous Items"). */
function titleizeSlug(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

  // equipment_category ist die einzige Typ-Quelle. Fehlt sie (Altbestand), aus den
  // vorhandenen Feldern bzw. dem abgelösten item_type ableiten.
  const hasCat = !!(r.equipment_category as { index?: string } | undefined)?.index;
  if (!hasCat) {
    let idx: string;
    if (r.weapon_category || r.damage) idx = 'weapon';
    else if (r.armor_category || r.armor_class) idx = 'armor';
    else if (r.item_type === 'weapon') idx = 'weapon';
    else if (r.item_type === 'armor') idx = 'armor';
    else if (r.item_type === 'magic' || r.rarity) idx = 'wondrous-items';
    else idx = 'adventuring-gear';
    r.equipment_category = { index: idx, name: titleizeSlug(idx) };
  }
  delete r.item_type;

  return r;
}

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
  item_type: z.enum(['weapon', 'armor', 'magic', 'gear']).optional(),
  equipment_category: namedRef().optional(),
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

const WEAPON_CATS = ['weapon', 'martial-melee', 'martial-ranged', 'simple-melee', 'simple-ranged', 'ammunition'];
const ARMOR_CATS = ['armor', 'light-armor', 'medium-armor', 'heavy-armor', 'shields'];
const MAGIC_CATS = ['ring', 'wundersam', 'trank', 'stab', 'schriftrolle', 'wondrous-items', 'potion', 'rod', 'staff', 'wand', 'scroll'];

/** Migriert Altformat-Felder und leitet `item_type` ab, bevor das Schema greift. Idempotent. */
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

  if (!r.item_type) {
    const cat = (r.equipment_category as { index?: string } | undefined)?.index ?? '';
    if (r.weapon_category || r.damage || WEAPON_CATS.includes(cat)) r.item_type = 'weapon';
    else if (r.armor_category || r.armor_class || ARMOR_CATS.includes(cat)) r.item_type = 'armor';
    else if (r.rarity || MAGIC_CATS.includes(cat)) r.item_type = 'magic';
    else r.item_type = 'gear';
  }
  return r;
}

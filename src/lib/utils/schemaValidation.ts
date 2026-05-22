import type { Spell, Monster, Item } from '../types';
import { SPELL_SCHOOLS, normalizeSpell, normalizeMonster } from '../types';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

// ── Spell ──────────────────────────────────────────────────────────────────────

export function parseSpell(raw: unknown): ParseResult<Spell> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['Kein gültiges JSON-Objekt'] };

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== 'string' || !obj.name.trim())
    errors.push('"name" fehlt oder ist leer');

  if (obj.school !== undefined && typeof obj.school === 'string' && !(obj.school in SPELL_SCHOOLS))
    errors.push(`"school" "${obj.school}" unbekannt – gültig: ${Object.keys(SPELL_SCHOOLS).join(', ')}`);

  const hasContent =
    (Array.isArray(obj.desc) && obj.desc.length > 0) ||
    (Array.isArray(obj.desc_de) && obj.desc_de.length > 0) ||
    typeof obj.description === 'string';
  if (!hasContent)
    errors.push('"desc" oder "desc_de" (Textarray) fehlt');

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: normalizeSpell(obj) };
}

// ── Monster ────────────────────────────────────────────────────────────────────

export function parseMonster(raw: unknown): ParseResult<Monster> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['Kein gültiges JSON-Objekt'] };

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== 'string' || !obj.name.trim())
    errors.push('"name" fehlt oder ist leer');

  if (!obj.stats || typeof obj.stats !== 'object')
    errors.push('"stats" ({str,dex,con,int,wis,cha}) fehlt');

  if (obj.cr === undefined && obj.challenge_rating === undefined)
    errors.push('"cr" (Herausforderungsgrad als String, z.B. "1/4" oder "2") fehlt');

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: normalizeMonster(obj as unknown as Monster) };
}

// ── Item ───────────────────────────────────────────────────────────────────────

export function normalizeItem(raw: Record<string, unknown>): Item {
  // migrate old rarity: string → { name }
  if (typeof raw.rarity === 'string') raw.rarity = { name: raw.rarity };
  // migrate old description → desc
  if (!raw.desc && typeof raw.description === 'string') {
    raw.desc = raw.description ? [raw.description as string] : [];
    delete raw.description;
  }
  // migrate old category → equipment_category
  if (!raw.equipment_category && typeof raw.category === 'string') {
    const cat = raw.category as string;
    raw.equipment_category = { index: cat, name: cat };
    delete raw.category;
  }
  // migrate attunement_requirements → attunement_by
  if ('attunement_requirements' in raw && !('attunement_by' in raw)) {
    raw.attunement_by = raw.attunement_requirements ?? null;
    delete raw.attunement_requirements;
  }
  if (!Array.isArray(raw.desc)) raw.desc = [];

  // derive item_type from other fields if missing
  if (!raw.item_type) {
    const cat = (raw.equipment_category as { index?: string } | undefined)?.index ?? '';
    if (
      raw.weapon_category || raw.damage ||
      ['weapon','martial-melee','martial-ranged','simple-melee','simple-ranged','ammunition'].includes(cat)
    ) {
      raw.item_type = 'weapon';
    } else if (
      raw.armor_category || raw.armor_class ||
      ['armor','light-armor','medium-armor','heavy-armor','shields'].includes(cat)
    ) {
      raw.item_type = 'armor';
    } else if (
      raw.rarity ||
      ['ring','wundersam','trank','stab','schriftrolle','wondrous-items','potion','rod','staff','wand','scroll'].includes(cat)
    ) {
      raw.item_type = 'magic';
    } else {
      raw.item_type = 'gear';
    }
  }

  return raw as unknown as Item;
}

export function parseItem(raw: unknown): ParseResult<Item> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['Kein gültiges JSON-Objekt'] };

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.name !== 'string' || !obj.name.trim())
    errors.push('"name" fehlt oder ist leer');

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: normalizeItem(obj) };
}

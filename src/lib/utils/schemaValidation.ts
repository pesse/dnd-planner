/**
 * Runtime-Validierung & Normalisierung der Entitäten — getrieben von den
 * Zod-Schemas in schemas/ (Single Source of Truth).
 *
 * - `normalizeX(raw)`  → nachsichtig: migriert Altformate, füllt Defaults, strippt
 *   Unbekanntes. Wirft NIE (Fallback = migrierte Rohdaten), damit das Laden/
 *   Rendern von Vault-Dateien robust bleibt.
 * - `parseX(raw)`      → Validierungs-Gate mit `ParseResult` (z.B. für Editoren).
 */
import type { Spell, Monster, Item, Encounter } from '../types';
import { spellSchema, migrateSpellLegacy } from '../schemas/spell';
import { monsterSchema, migrateMonsterLegacy } from '../schemas/monster';
import { itemSchema, migrateItemLegacy } from '../schemas/item';
import { encounterSchema, migrateEncounterLegacy } from '../schemas/encounter';
import { characterSchema, migrateCharacterLegacy, type Character } from '../schemas/character';
import { classProgressionSchema, type ClassProgression } from '../schemas/classProgression';
import { speciesSchema, type Species } from '../schemas/species';
import { featSchema, type Feat } from '../schemas/feat';
import type { ZodType } from 'zod';

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

type Migrate = (raw: unknown) => Record<string, unknown>;

/** Nachsichtig: migrieren + parsen, bei Fehlern die migrierten Rohdaten zurückgeben. */
function normalize<T>(schema: ZodType, migrate: Migrate, raw: unknown): T {
  const migrated = migrate(raw);
  const r = schema.safeParse(migrated);
  return (r.success ? r.data : migrated) as T;
}

/** Strikt: Validierungs-Gate mit lesbaren Fehlern. */
function parse<T>(schema: ZodType, migrate: Migrate, raw: unknown): ParseResult<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['Kein gültiges JSON-Objekt'] };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim())
    return { ok: false, errors: ['"name" fehlt oder ist leer'] };

  const r = schema.safeParse(migrate(raw));
  if (r.success) return { ok: true, data: r.data as T };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

// ── Spell ──────────────────────────────────────────────────────────────────────
export const normalizeSpell = (raw: unknown): Spell => normalize(spellSchema, migrateSpellLegacy, raw);
export const parseSpell = (raw: unknown): ParseResult<Spell> => parse(spellSchema, migrateSpellLegacy, raw);

// ── Monster ──────────────────────────────────────────────────────────────────────
export const normalizeMonster = (raw: unknown): Monster => normalize(monsterSchema, migrateMonsterLegacy, raw);
export const parseMonster = (raw: unknown): ParseResult<Monster> => parse(monsterSchema, migrateMonsterLegacy, raw);

// ── Item ───────────────────────────────────────────────────────────────────────
export const normalizeItem = (raw: unknown): Item => normalize(itemSchema, migrateItemLegacy, raw);
export const parseItem = (raw: unknown): ParseResult<Item> => parse(itemSchema, migrateItemLegacy, raw);

// ── Encounter ────────────────────────────────────────────────────────────────────
export const normalizeEncounter = (raw: unknown): Encounter => normalize(encounterSchema, migrateEncounterLegacy, raw);
export const parseEncounter = (raw: unknown): ParseResult<Encounter> => parse(encounterSchema, migrateEncounterLegacy, raw);

// ── Character ────────────────────────────────────────────────────────────────────
export const normalizeCharacter = (raw: unknown): Character => normalize(characterSchema, migrateCharacterLegacy, raw);
export const parseCharacter = (raw: unknown): ParseResult<Character> => parse(characterSchema, migrateCharacterLegacy, raw);

// ── Klasse (Regel-Bibliothek) ──────────────────────────────────────────────────────
const identity: Migrate = (raw) => raw as Record<string, unknown>;
export const parseClass = (raw: unknown): ParseResult<ClassProgression> => parse(classProgressionSchema, identity, raw);

// ── Spezies (Regel-Bibliothek) ─────────────────────────────────────────────────────
export const parseSpecies = (raw: unknown): ParseResult<Species> => parse(speciesSchema, identity, raw);

// ── Talent (Regel-Bibliothek) ──────────────────────────────────────────────────────
export const parseFeat = (raw: unknown): ParseResult<Feat> => parse(featSchema, identity, raw);

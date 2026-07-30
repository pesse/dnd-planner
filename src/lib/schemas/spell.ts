/**
 * Single Source of Truth für Zauber: Zod-Schema → TS-Type + Runtime-Validator +
 * LLM-JSON-Schema (siehe shared.ts). Label-Maps/Helper bleiben in types.ts.
 */
import { z } from 'zod';
import { SPELL_SCHOOLS, type SpellSchool } from '../types';
import { namedRef, sourceField, migrateSourceLegacy, OWN_SOURCE } from './shared';

const schoolEnum = z.enum(Object.keys(SPELL_SCHOOLS) as [SpellSchool, ...SpellSchool[]]);

export const spellSchema = z.object({
  index: z.string().optional().describe('API-Slug (leer bei Homebrew).'),
  key: z.string().optional().describe('Open5e-Key, z.B. "srd-2024_moonbeam" (für Verlinkung/Dedup; bei Zaubern meist leer).'),
  name: z.string(),
  name_en: z.string().optional().describe('Kanonischer englischer SRD-Name (für EN↔DE-Matching, z.B. wenn die KI "Moonbeam" liefert und der Zauber lokal als "Mondstrahl" liegt).'),
  level: z.number().int().default(0).describe('0 = Zaubertrick, 1–9'),
  school: schoolEnum
    .default('evocation')
    .describe('engl. Schule: abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation'),
  casting_time: z.string().default(''),
  range: z.string().default(''),
  components: z
    .object({
      verbal: z.boolean().default(false),
      somatic: z.boolean().default(false),
      material: z.boolean().default(false),
      materials_needed: z.string().nullable().default(null),
    })
    .default({ verbal: false, somatic: false, material: false, materials_needed: null }),
  duration: z.string().default(''),
  concentration: z.boolean().default(false),
  ritual: z.boolean().default(false),
  classes: z.array(z.string()).default([]),
  desc: z.array(z.string()).default([]).describe('Beschreibung (Absätze).'),
  desc_de: z.array(z.string()).optional().describe('Deutsche Beschreibung.'),
  higher_level: z.array(z.string()).nullable().optional(),
  higher_level_de: z.array(z.string()).nullable().optional(),
  damage: z
    .object({
      damage_type: namedRef(),
      damage_at_slot_level: z.record(z.string(), z.string()).optional(),
      damage_at_character_level: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  dc: z
    .object({
      dc_type: namedRef(),
      dc_success: z.string().describe("'half' | 'none' | 'other'"),
    })
    .optional(),
  area_of_effect: z
    .object({
      type: z.string().describe("'sphere' | 'cone' | 'cube' | 'line' | 'cylinder'"),
      size: z.number().describe('in Fuß'),
    })
    .optional(),
  source: sourceField(),
  document: z
    .object({ key: z.string(), gamesystem: z.string() })
    .optional()
    .describe('Open5e-Herkunftsdokument; document.key === source (Pack-Build-Invariante).'),
});

export type Spell = z.infer<typeof spellSchema>;
export type SpellDamage = NonNullable<z.infer<typeof spellSchema>['damage']>;

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Identität eines Zaubers, auch ohne `key` in der Datei (Altbestand/Homebrew). Analog
 * zu `itemKeyOf`: der Import setzt `key` explizit, hier greift nur der Backfill. Slug
 * folgt dem englischen Namen (Open5e-Konvention `srd-2024_acid-arrow`).
 */
export function spellKeyOf(raw: Record<string, unknown>): string {
  if (typeof raw.key === 'string' && raw.key) return raw.key;
  const migrated = migrateSourceLegacy({ ...raw });
  const source = typeof migrated.source === 'string' && migrated.source ? migrated.source : OWN_SOURCE;
  const en = typeof raw.name_en === 'string' && raw.name_en ? raw.name_en : '';
  const name = en || (typeof raw.name === 'string' ? raw.name : '');
  return name ? `${source}_${slugify(name)}` : '';
}

/** Migriert Altformat-Felder, bevor das Schema greift. Idempotent. */
export function migrateSpellLegacy(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const s = { ...(raw as Record<string, unknown>) };

  // level: string → number
  if (typeof s.level === 'string') {
    s.level = s.level === 'cantrip' || s.level === '0' ? 0 : parseInt(s.level, 10) || 0;
  }
  // description (alt) → desc_de
  if (typeof s.description === 'string') {
    s.desc_de ??= [s.description];
    delete s.description;
  }
  // higher_levels (alt) → higher_level_de
  if ('higher_levels' in s) {
    const hl = s.higher_levels as string | null;
    if (hl) s.higher_level_de ??= [hl];
    delete s.higher_levels;
  }

  const migrated = migrateSourceLegacy(s);

  // `key` + `document` backfillen, damit Altbestand/Homebrew das einheitliche
  // Identitäts-/Herkunftsmodell trägt (source === document.key). Der Importer setzt
  // beides explizit; hier greift nur, was noch keins hat. Idempotent.
  const source =
    typeof migrated.source === 'string' && migrated.source ? migrated.source : OWN_SOURCE;
  if (!migrated.key) {
    const k = spellKeyOf(migrated);
    if (k) migrated.key = k;
  }
  const doc = migrated.document as { key?: string; gamesystem?: string } | undefined;
  if (!doc || typeof doc !== 'object') migrated.document = { key: source, gamesystem: '' };
  else if (!doc.key) doc.key = source;

  return migrated;
}

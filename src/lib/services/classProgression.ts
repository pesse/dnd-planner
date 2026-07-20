/**
 * Deterministische Klassen-Progressions-Engine — gespeist DIREKT aus Open5e v2
 * (kein gebündeltes Zwischenartefakt, kein Markdown-Parser).
 *
 * Ablauf: v2-Klasse holen (open5eApi) → auf den offenen internen Typ mappen
 * (`mapV2`) → Zod-validieren → in einem In-Memory-Cache (pro Session) halten.
 * Reader (Slots/Übungsbonus/Merkmale) lesen die datengetriebenen Spalten.
 *
 * Nur strukturell vorhandene Zahlen sind „deterministisch": Zauberplätze,
 * Übungsbonus, Zaubertricks, Trefferwürfel, Rettungswürfe, Feature-Stufen.
 * Rüstungs-/Waffen-Übungen liefert v2 NICHT strukturiert (nur Prosa) → die
 * bleiben der LLM-Schicht überlassen.
 */
import {
  classProgressionSchema,
  type ClassProgression,
  type ClassFeature,
  type AbilityKey,
} from '$lib/schemas/classProgression';
import { getClass, DEFAULT_DOCUMENT } from './open5eApi';

// ── Namens-/Attribut-Maps ──────────────────────────────────────────────────────
/** Deutscher Klassenname → Open5e-Slug (die 12 SRD-Grundklassen). */
const DE_TO_SLUG: Record<string, string> = {
  Barbar: 'barbarian', Barde: 'bard', Kleriker: 'cleric', Druide: 'druid',
  Kämpfer: 'fighter', Mönch: 'monk', Paladin: 'paladin', Waldläufer: 'ranger',
  Schurke: 'rogue', Zauberer: 'sorcerer', Hexenmeister: 'warlock', Magier: 'wizard',
};
export const CLASS_NAMES_DE: string[] = Object.keys(DE_TO_SLUG);

const ABILITY_FROM_EN: Record<string, AbilityKey> = {
  strength: 'str', dexterity: 'ges', constitution: 'kon',
  intelligence: 'int', wisdom: 'wei', charisma: 'cha',
};

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

// ── v2 → interner Typ ────────────────────────────────────────────────────────
interface V2Feature {
  key?: string;
  name?: string;
  desc?: string;
  feature_type?: string;
  gained_at?: { level: number; detail: string | null }[];
  data_for_class_table?: { level: number; column_value: string }[];
}

/** Bildet eine rohe v2-Klasse auf den offenen internen Typ ab. */
export function mapV2(raw: Record<string, unknown>): ClassProgression {
  const feats = (raw.features as V2Feature[]) ?? [];
  const hp = (raw.hit_points as Record<string, string>) ?? {};
  const doc = (raw.document as { key?: string; gamesystem?: { key?: string } }) ?? {};

  // Spalten-Features (data_for_class_table befüllt) → levels[].columns aufbauen.
  const columnFeats = feats.filter((f) => (f.data_for_class_table?.length ?? 0) > 0);
  const levelMap = new Map<number, Record<string, string>>();
  for (const f of columnFeats) {
    for (const row of f.data_for_class_table!) {
      const cols = levelMap.get(row.level) ?? {};
      cols[f.name ?? ''] = row.column_value;
      levelMap.set(row.level, cols);
    }
  }
  const levels = [...levelMap.entries()]
    .map(([level, columns]) => ({ level, columns }))
    .sort((a, b) => a.level - b.level);

  // Echte Merkmale (gained_at befüllt).
  const features: ClassFeature[] = feats
    .filter((f) => (f.gained_at?.length ?? 0) > 0)
    .map((f) => ({
      key: f.key ?? '',
      name: f.name ?? '',
      gainedAt: [...new Set((f.gained_at ?? []).map((g) => g.level))].sort((a, b) => a - b),
      desc: f.desc ?? '',
      featureType: f.feature_type,
    }));

  const mapped = {
    key: (raw.key as string) ?? '',
    name: (raw.name as string) ?? '',
    casterType: (raw.caster_type as string) ?? 'NONE',
    hitDie: Number(String(raw.hit_dice ?? hp.hit_dice ?? '').match(/(\d+)/)?.[1] ?? 0),
    hpAt1st: hp.hit_points_at_1st_level ?? '',
    hpHigher: hp.hit_points_at_higher_levels ?? '',
    savingThrows: ((raw.saving_throws as { name?: string }[]) ?? [])
      .map((s) => ABILITY_FROM_EN[(s.name ?? '').toLowerCase()])
      .filter(Boolean) as AbilityKey[],
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    levels,
    features,
  };
  return classProgressionSchema.parse(mapped);
}

// ── Cache + Zugriff ──────────────────────────────────────────────────────────
const cache = new Map<string, ClassProgression | null>();

/** Baut den v2-Key aus deutschem Klassennamen + Quelle (Default SRD 5.2). */
function keyFor(klasseDe: string, doc = DEFAULT_DOCUMENT): string | null {
  const slug = DE_TO_SLUG[CLASS_NAMES_DE.find((c) => fold(c) === fold(klasseDe.trim())) ?? ''];
  return slug ? `${doc}_${slug}` : null;
}

/**
 * Holt (und cached) die Progression zu einem deutschen Klassennamen. Netzfehler /
 * unbekannte Klasse / unparsebares Dokument → null (Aufrufer degradieren dann,
 * statt selbstsicher falsche Zahlen zu erzeugen).
 */
export async function getProgression(klasseDe: string, doc = DEFAULT_DOCUMENT): Promise<ClassProgression | null> {
  const key = keyFor(klasseDe, doc);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const prog = mapV2(await getClass(key));
    cache.set(key, prog);
    return prog;
  } catch {
    cache.set(key, null);
    return null;
  }
}

// ── Reader (deterministisch, aus den strukturierten Spalten) ───────────────────
export const proficiencyBonus = (level: number): number => 2 + Math.floor((Math.max(1, level) - 1) / 4);
const clampLevel = (level: number): number => Math.min(20, Math.max(1, Math.floor(level)));

const columnsAt = (prog: ClassProgression, level: number): Record<string, string> =>
  prog.levels.find((r) => r.level === clampLevel(level))?.columns ?? {};

/** Rohwert einer Tabellenspalte auf einer Stufe (z.B. "Cantrips", "Rages"). */
export function columnValue(prog: ClassProgression, column: string, level: number): string | undefined {
  return columnsAt(prog, level)[column];
}

/**
 * Zauberplätze (Index 0 = Grad 1 … 8 = Grad 9). Standard-Zauberer: Spalten „1st"…„9th".
 * Pact Magic (Warlock): Sonderspalten „Spell Slots" (Anzahl) + „Slot Level" (Grad).
 */
export function spellSlotsAt(prog: ClassProgression, level: number): number[] {
  const cols = columnsAt(prog, level);
  const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  const std = ord.map((c) => {
    const v = cols[c];
    return v && v !== '-' ? Number(v) || 0 : 0;
  });
  if (std.some((n) => n > 0)) return std;
  // Pact Magic (Warlock): „Spell Slots" (Anzahl) auf Grad „Slot Level".
  const count = Number(cols['Spell Slots']) || 0;
  const grade = Number(String(cols['Slot Level'] ?? '').match(/(\d+)/)?.[1] ?? 0);
  return Array.from({ length: 9 }, (_, i) => (count > 0 && grade >= 1 && grade <= 9 && i === grade - 1 ? count : 0));
}

/** Merkmale, die eine Klasse GENAU auf der Zielstufe erlangt. */
export function featuresGainedAt(prog: ClassProgression, level: number): ClassFeature[] {
  const t = clampLevel(level);
  return prog.features.filter((f) => f.gainedAt.includes(t));
}

/** Alle Merkmale bis einschließlich einer Stufe (für Erstellung auf Stufe N). */
export function featuresUpTo(prog: ClassProgression, level: number): ClassFeature[] {
  const t = clampLevel(level);
  return prog.features
    .filter((f) => f.gainedAt.some((l) => l <= t))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

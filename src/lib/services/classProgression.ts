/**
 * Deterministische Klassen-Progression, gespeist direkt aus Open5e v2 (kein gebündeltes
 * Zwischenartefakt). Deterministisch ist nur, was v2 strukturiert führt — Rüstungs- und
 * Waffenübungen stehen dort als Prosa und bleiben deshalb der LLM-Schicht überlassen.
 */
import {
  classProgressionSchema,
  migrateClassLegacy,
  type ClassProgression,
  type ClassFeature,
  type AbilityKey,
} from '$lib/schemas/classProgression';
import { ABILITY_FROM_EN, ABILITY_TO_EN } from '$lib/schemas/abilities';
export { ABILITY_FROM_EN, ABILITY_TO_EN };
import { getClass, DEFAULT_DOCUMENT } from './open5eClient';
import { findClassByKey } from '$lib/classLibrary';
import { mapV2 } from './classTableParse';
export { mapV2, parseCoreTraits, parseCoreTraitRows, parseSkillGrant } from './classTableParse';
import { firstInt, numOr } from '$lib/utils/num';

const DE_TO_SLUG: Record<string, string> = {
  Barbar: 'barbarian', Barde: 'bard', Kleriker: 'cleric', Druide: 'druid',
  Kämpfer: 'fighter', Mönch: 'monk', Paladin: 'paladin', Waldläufer: 'ranger',
  Schurke: 'rogue', Zauberer: 'sorcerer', Hexenmeister: 'warlock', Magier: 'wizard',
};
export const CLASS_NAMES_DE: string[] = Object.keys(DE_TO_SLUG);

/** Abgeleitet, nicht als zweite Tabelle gepflegt — es gibt genau eine Klassen-Übersetzung. */
export const CLASS_NAME_DE_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(DE_TO_SLUG).map(([de, slug]) => [slug, de]),
);

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

const cache = new Map<string, ClassProgression | null>();

/**
 * Aus `vault/classes`, wo auch Homebrew und eigene Subklassen liegen, die das
 * SRD-Dokument nicht kennt. Über den Migrator parsen — Altbestand trägt `savingThrows`
 * noch in deutschen App-Schlüsseln am Klassenkopf statt englisch im `proficiencyGrant`.
 */
function getLocalProgression(key: string): Promise<ClassProgression | null> {
  return findClassByKey(key, (data) => classProgressionSchema.safeParse(migrateClassLegacy(data)).data ?? null);
}

function keyFor(klasseDe: string, doc = DEFAULT_DOCUMENT): string | null {
  const slug = DE_TO_SLUG[CLASS_NAMES_DE.find((c) => fold(c) === fold(klasseDe.trim())) ?? ''];
  return slug ? `${doc}_${slug}` : null;
}

/** Jeder Fehlschlag wird zu `null` — der Aufrufer degradiert, statt falsche Zahlen zu zeigen. */
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

/**
 * Der Weg über `classes[].sourceKey` am Charakter — und AUSSCHLIESSLICH aus der lokalen
 * Bibliothek, kein Open5e-Zugriff zur Laufzeit. Fehlt die Klasse dort, degradiert der
 * Aufrufer auf `null` (isHomebrew → die KI fragt ab).
 */
export async function getProgressionByKey(key: string): Promise<ClassProgression | null> {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const local = await getLocalProgression(key);
  cache.set(key, local);
  return local;
}

export const proficiencyBonus = (level: number): number => 2 + Math.floor((Math.max(1, level) - 1) / 4);
const clampLevel = (level: number): number => Math.min(20, Math.max(1, Math.floor(level)));

const columnsAt = (prog: ClassProgression, level: number): Record<string, string> =>
  prog.levels.find((r) => r.level === clampLevel(level))?.columns ?? {};

/** `column` ist der v2-Spaltenname, roh und offen: "Cantrips", "Rages", "Sneak Attack". */
export function columnValue(prog: ClassProgression, column: string, level: number): string | undefined {
  return columnsAt(prog, level)[column];
}

/** Index 0 = Grad 1 … 8 = Grad 9, auch für Pact Magic (Warlock) mit seiner einen Grad-Spalte. */
export function spellSlotsAt(prog: ClassProgression, level: number): number[] {
  const cols = columnsAt(prog, level);
  const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  const std = ord.map((c) => {
    const v = cols[c];
    return numOr(v);
  });
  if (std.some((n) => n > 0)) return std;
  // Pact Magic führt statt der neun Grad-Spalten „Spell Slots" (Anzahl) und „Slot Level".
  const count = numOr(cols['Spell Slots']);
  const grade = firstInt(cols['Slot Level']);
  return Array.from({ length: 9 }, (_, i) => (count > 0 && grade >= 1 && grade <= 9 && i === grade - 1 ? count : 0));
}

export function featuresGainedAt(prog: ClassProgression, level: number): ClassFeature[] {
  const t = clampLevel(level);
  return prog.features.filter((f) => f.gainedAt.includes(t));
}

export function featuresUpTo(prog: ClassProgression, level: number): ClassFeature[] {
  const t = clampLevel(level);
  return prog.features
    .filter((f) => f.gainedAt.some((l) => l <= t))
    .sort((a, b) => Math.min(...a.gainedAt) - Math.min(...b.gainedAt));
}

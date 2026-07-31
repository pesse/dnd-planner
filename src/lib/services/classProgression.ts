/**
 * Deterministische Klassen-Progressions-Engine — gespeist DIREKT aus Open5e v2
 * (kein gebündeltes Zwischenartefakt, kein Markdown-Parser).
 *
 * Ablauf: v2-Klasse holen → `mapV2` (classTableParse.ts) → Zod-validieren → in einem
 * In-Memory-Cache pro Session halten. Die Reader lesen die datengetriebenen Spalten.
 *
 * Nur strukturell vorhandene Zahlen sind „deterministisch": Zauberplätze, Übungsbonus,
 * Zaubertricks, Trefferwürfel, Rettungswürfe, Feature-Stufen. Rüstungs-/Waffen-Übungen
 * liefert v2 NICHT strukturiert (nur Prosa) → die bleiben der LLM-Schicht überlassen.
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

/** Deutscher Klassenname → Open5e-Slug (die 12 SRD-Grundklassen). */
const DE_TO_SLUG: Record<string, string> = {
  Barbar: 'barbarian', Barde: 'bard', Kleriker: 'cleric', Druide: 'druid',
  Kämpfer: 'fighter', Mönch: 'monk', Paladin: 'paladin', Waldläufer: 'ranger',
  Schurke: 'rogue', Zauberer: 'sorcerer', Hexenmeister: 'warlock', Magier: 'wizard',
};
export const CLASS_NAMES_DE: string[] = Object.keys(DE_TO_SLUG);

/**
 * Umkehrung von `DE_TO_SLUG` — der deutsche Anzeigename je Slug. Abgeleitet, nicht als
 * zweite Tabelle gepflegt: Anzeige-Labels für Klassen-Keys, die als Daten ankommen
 * (`grantsChoice.spellLists` = ["cleric","druid","wizard"] → „Kleriker"/„Druide"/„Magier").
 */
export const CLASS_NAME_DE_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(DE_TO_SLUG).map(([de, slug]) => [slug, de]),
);

// Beide Übersetzungsrichtungen bleiben hier auffindbar; das Vokabular selbst
// steht in schemas/abilities.ts.

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

const cache = new Map<string, ClassProgression | null>();

/**
 * Lädt eine Progression aus der LOKALEN Bibliothek (`vault/classes`) per v2-Key.
 * Die dortigen JSONs sind bereits progression-förmig (import via `mapV2` + Übersetzung),
 * daher schneller als der Open5e-Netzabruf UND enthalten Homebrew/eigene Subklassen
 * (z.B. „Circle of the Moon"), die im SRD-Dokument fehlen. null = nicht lokal vorhanden.
 */
function getLocalProgression(key: string): Promise<ClassProgression | null> {
  // ÜBER den Migrator parsen — Altbestand trägt `savingThrows` noch in deutschen
  // App-Schlüsseln am Klassenkopf statt englisch im `proficiencyGrant`.
  return findClassByKey(key, (data) => classProgressionSchema.safeParse(migrateClassLegacy(data)).data ?? null);
}

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

/**
 * Wie `getProgression`, aber direkt über den Open5e-v2-Key (z.B. „srd-2024_ranger"),
 * wie er strukturiert am Charakter (`classes[].sourceKey`) hängt. Bildet die Brücke
 * für einen späteren Character-vs-Progression-Check. Leerer Key / Fehler → null.
 */
export async function getProgressionByKey(key: string): Promise<ClassProgression | null> {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  // AUSSCHLIESSLICH lokale Bibliothek — kein Open5e-Zugriff zur Laufzeit. Fehlt eine
  // Klasse/Subklasse lokal, muss sie zuvor lokal angelegt werden (Import in der Sidebar
  // kann Open5e als Basis nutzen). null → Aufrufer degradiert (isHomebrew → KI fragt ab).
  const local = await getLocalProgression(key);
  cache.set(key, local);
  return local;
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
    return numOr(v);
  });
  if (std.some((n) => n > 0)) return std;
  // Pact Magic (Warlock): „Spell Slots" (Anzahl) auf Grad „Slot Level".
  const count = numOr(cols['Spell Slots']);
  const grade = firstInt(cols['Slot Level']);
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

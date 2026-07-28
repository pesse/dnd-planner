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
import { invoke } from '@tauri-apps/api/core';
import {
  classProgressionSchema,
  migrateClassLegacy,
  type ClassProgression,
  type ClassFeature,
  type AbilityKey,
} from '$lib/schemas/classProgression';
import {
  toSourceKey,
  emptyProficiencyGrant,
  parseSkillNames,
  readAbilityName,
  readArmorTraining,
  readWeaponCategory,
  splitRuleList,
  type AbilityName,
  type ArmorTraining,
  type ProficiencyGrant,
  type SkillGrant,
  type WeaponCategory,
} from '$lib/schemas/shared';
import { getClass, DEFAULT_DOCUMENT } from './open5eApi';
import { getClasses } from '$lib/classLibrary';

// ── Namens-/Attribut-Maps ──────────────────────────────────────────────────────
/** Deutscher Klassenname → Open5e-Slug (die 12 SRD-Grundklassen). */
const DE_TO_SLUG: Record<string, string> = {
  Barbar: 'barbarian', Barde: 'bard', Kleriker: 'cleric', Druide: 'druid',
  Kämpfer: 'fighter', Mönch: 'monk', Paladin: 'paladin', Waldläufer: 'ranger',
  Schurke: 'rogue', Zauberer: 'sorcerer', Hexenmeister: 'warlock', Magier: 'wizard',
};
export const CLASS_NAMES_DE: string[] = Object.keys(DE_TO_SLUG);

export const ABILITY_FROM_EN: Record<string, AbilityKey> = {
  strength: 'str', dexterity: 'ges', constitution: 'kon',
  intelligence: 'int', wisdom: 'wei', charisma: 'cha',
};

/**
 * Umkehrung von `ABILITY_FROM_EN` (App-Schlüssel → englischer SRD-Name). Lebt im
 * Schema, weil die Altdaten-Migration sie braucht; hier nur re-exportiert, damit
 * beide Übersetzungsrichtungen an derselben Stelle auffindbar bleiben.
 */
export { ABILITY_TO_EN } from '$lib/schemas/classProgression';

/** v2-Kopf-`saving_throws` (`[{name: "Strength"}]`) → englische Attributsnamen. */
const readAbilityNames = (raw: { name?: string }[]): AbilityName[] =>
  raw.map((s) => readAbilityName(s.name ?? '')).filter((a): a is AbilityName => a !== null);

const fold = (s: string): string =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

// ── Kerntabelle („Core Traits") ───────────────────────────────────────────────
//
// Open5e v2 liefert die Kerntabelle als Merkmal mit `feature_type:
// "CORE_TRAITS_TABLE"` und LEEREM `gained_at` — ihr `desc` ist eine Markdown-
// Tabelle `|Zeile|Wert|`. Aus ihr entstehen die vier Übungs-Arten plus die
// Anfangsausrüstung als Prosa. „Primary Ability" und „Hit Point Die" stehen
// bereits strukturiert in v2, „Tool Proficiencies" bleibt bewusst Prosa
// (Werkzeuge sind kein geschlossenes Vokabular in dieser App).

/** Rohe Kerntabellen-Zeilen: Zeilentitel → Wert. */
export function parseCoreTraitRows(desc: string): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const line of desc.split('\n')) {
    const cells = line.split('|');
    // `|Titel|Wert|` → ['', 'Titel', 'Wert', '']; Trenn-/Kopfzeilen haben keinen Titel.
    if (cells.length < 4) continue;
    const title = cells[1].trim();
    const value = cells[2].trim();
    if (!title || /^-+$/.test(title)) continue;
    rows[title] = value;
  }
  return rows;
}

/**
 * „Skill Proficiencies"-Zelle → `skillGrant`. Drei Formen kommen vor:
 *   „Choose 2: Animal Handling, Athletics, … or Survival" → {choose:2, from:[…]}
 *   „Choose any 3 skills"                                 → {choose:3, from:[]}
 *   Aufzählung ohne „Choose"                              → {fixed:[…]}
 */
export function parseSkillGrant(raw: string, context = 'Skill Proficiencies'): SkillGrant {
  const value = raw.trim();
  if (!value || /^none$/i.test(value)) return { fixed: [], choose: 0, from: [] };

  const choose = Number(value.match(/choose\s+(?:any\s+)?(\d+)/i)?.[1] ?? 0);
  if (!choose) return { fixed: parseSkillNames(value, context), choose: 0, from: [] };

  // Die Auswahlliste steht nach dem Doppelpunkt; ohne Doppelpunkt („any 3 skills")
  // ist jede Fertigkeit erlaubt.
  const listPart = value.includes(':') ? value.slice(value.indexOf(':') + 1) : '';
  return { fixed: [], choose, from: listPart.trim() ? parseSkillNames(listPart, context) : [] };
}

/** „Saving Throw Proficiencies"-Zelle → englische Attributsnamen. */
function parseSavingThrows(raw: string, context: string): AbilityName[] {
  const out: AbilityName[] = [];
  for (const part of splitRuleList(raw)) {
    const ability = readAbilityName(part);
    if (!ability) throw new Error(`${context}: unbekanntes Attribut "${part}" (aus "${raw}")`);
    if (!out.includes(ability)) out.push(ability);
  }
  return out;
}

/**
 * „Weapon Proficiencies"-Zelle → Kategorien + Sonderfälle.
 * „Simple and Martial weapons" → ['Simple','Martial']; die eingeschränkten Formen
 * („Martial weapons that have the Light property" bei Mönch/Schurke) sind KEINE
 * Kategorie-Übung und landen wörtlich in `weaponsOther`.
 */
function parseWeapons(raw: string): { weapons: WeaponCategory[]; weaponsOther: string[] } {
  const weapons: WeaponCategory[] = [];
  const weaponsOther: string[] = [];
  // NUR an „and" trennen, nicht an „or": das „or" gehört zu den Einschränkungen
  // („… the Finesse or Light property") und darf die Phrase nicht zerreißen.
  for (const phrase of raw.split(/\band\b/gi).map((s) => s.trim()).filter(Boolean)) {
    if (/^none$/i.test(phrase)) continue;
    const category = readWeaponCategory(phrase);
    if (category) {
      if (!weapons.includes(category)) weapons.push(category);
    } else {
      weaponsOther.push(phrase.replace(/[.;]+$/, ''));
    }
  }
  return { weapons, weaponsOther };
}

/** „Armor Training"-Zelle → Rüstungsstufen. Unbekanntes (inkl. „None") fällt weg. */
function parseArmor(raw: string): ArmorTraining[] {
  const out: ArmorTraining[] = [];
  for (const part of splitRuleList(raw)) {
    const training = readArmorTraining(part);
    if (training && !out.includes(training)) out.push(training);
  }
  return out;
}

/**
 * Kerntabellen-Prosa → strukturierter Übungs-Grant + Anfangsausrüstung.
 * Wirft bei unbekannten Fertigkeits-/Attributsnamen (siehe `parseSkillNames`).
 */
export function parseCoreTraits(desc: string, context = 'Kerntabelle'): {
  grant: ProficiencyGrant;
  startingEquipment: string;
} {
  const rows = parseCoreTraitRows(desc);
  const { weapons, weaponsOther } = parseWeapons(rows['Weapon Proficiencies'] ?? '');
  return {
    grant: {
      skills: parseSkillGrant(rows['Skill Proficiencies'] ?? '', context),
      savingThrows: parseSavingThrows(rows['Saving Throw Proficiencies'] ?? '', context),
      weapons,
      weaponsOther,
      armor: parseArmor(rows['Armor Training'] ?? ''),
    },
    startingEquipment: rows['Starting Equipment'] ?? '',
  };
}

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

  // Kerntabelle: `gained_at` ist leer, deshalb ist sie KEIN Merkmal — aber ihr
  // `desc` trägt Fertigkeiten/Waffen/Rüstung/Rettungswürfe aller 12 Grundklassen.
  const coreTraits = feats.find((f) => f.feature_type === 'CORE_TRAITS_TABLE');
  const core = coreTraits?.desc
    ? parseCoreTraits(coreTraits.desc, `Kerntabelle ${raw.key ?? ''}`)
    : { grant: emptyProficiencyGrant(), startingEquipment: '' };

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

  const subclassOf = (raw.subclass_of as { key?: string } | null)?.key || undefined;

  const mapped = {
    key: (raw.key as string) ?? '',
    source: toSourceKey(doc.key),
    name: (raw.name as string) ?? '',
    subclassOf,
    casterType: (raw.caster_type as string) ?? 'NONE',
    hitDie: Number(String(raw.hit_dice ?? hp.hit_dice ?? '').match(/(\d+)/)?.[1] ?? 0),
    hpAt1st: hp.hit_points_at_1st_level ?? '',
    hpHigher: hp.hit_points_at_higher_levels ?? '',
    // Kerntabelle. Fehlt sie (Subklassen, Homebrew), bleibt `saving_throws` aus dem
    // v2-Kopf die Quelle der Rettungswürfe — der einzige Teil, den v2 doppelt führt.
    proficiencyGrant: coreTraits
      ? core.grant
      : { ...core.grant, savingThrows: readAbilityNames((raw.saving_throws as { name?: string }[]) ?? []) },
    // Beim Import NICHT ableitbar (steht nicht in v2) — bleibt leer und wird im Vault gepflegt.
    skillGrantMulticlass: { fixed: [], choose: 0, from: [] },
    startingEquipment: core.startingEquipment,
    document: { key: doc.key ?? '', gamesystem: doc.gamesystem?.key ?? '' },
    levels,
    features,
  };
  return classProgressionSchema.parse(mapped);
}

// ── Cache + Zugriff ──────────────────────────────────────────────────────────
const cache = new Map<string, ClassProgression | null>();

/**
 * Lädt eine Progression aus der LOKALEN Bibliothek (`vault/classes`) per v2-Key.
 * Die dortigen JSONs sind bereits progression-förmig (import via `mapV2` + Übersetzung),
 * daher schneller als der Open5e-Netzabruf UND enthalten Homebrew/eigene Subklassen
 * (z.B. „Circle of the Moon"), die im SRD-Dokument fehlen. null = nicht lokal vorhanden.
 */
async function getLocalProgression(key: string): Promise<ClassProgression | null> {
  try {
    const info = (await getClasses()).find((c) => c.key === key);
    if (!info) return null;
    const data = JSON.parse(await invoke<string>('read_file_content', { path: info.path }));
    // ÜBER den Migrator parsen — Altbestand trägt `savingThrows` noch in deutschen
    // App-Schlüsseln am Klassenkopf statt englisch im `proficiencyGrant`.
    const r = classProgressionSchema.safeParse(migrateClassLegacy(data));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
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

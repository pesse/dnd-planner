/**
 * Die geschlossenen Regel-Vokabulare und die Leser, die Regel-Prosa darauf abbilden.
 *
 * **Grundmechanik ist immer englisch.** Übungen sind in 5e 2024 geschlossene
 * Vokabulare (18 Fertigkeiten, 6 Rettungswürfe, 2 Waffenkategorien, 4 Rüstungs-
 * stufen) — die Bibliotheks-Artefakte tragen sie in SRD-Schreibweise. Der
 * Charakterbogen (`character.skills`, `*SaveProf`, `proficiencies.*`) bleibt
 * deutsch, weil das PDF-Formular die Feldnamen diktiert. Zwischen beidem liegt
 * GENAU EINE Übersetzungstabelle: `SKILL_DEFS.en` (domain/skills.ts) und
 * `ABILITY_FROM_EN`/`ABILITY_TO_EN` (schemas/abilities.ts).
 */
import { ABILITY_NAMES, type AbilityName } from './abilities';

export const SKILL_NAMES = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export const WEAPON_CATEGORIES = ['Simple', 'Martial'] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const ARMOR_TRAININGS = ['Light', 'Medium', 'Heavy', 'Shields'] as const;
export type ArmorTraining = (typeof ARMOR_TRAININGS)[number];

/**
 * Die acht Meisterschaftseigenschaften (Weapon Mastery, 5e 2024). Jede Waffe trägt
 * genau eine; fünf Klassen dürfen die von N Waffenarten ihrer Wahl nutzen.
 *
 * Wie bei `sourceField()` bewusst ein Enum statt Freitext: so kann ein LLM keinen
 * erfundenen Wert liefern. Deutsche Namen und Regeltexte liegen in
 * `itemLibrary.ts` (`MASTERY_INFO`) — hier steht nur das Vokabular, damit Zod es
 * ohne Umweg über die Anzeige-Schicht nutzen kann.
 */
export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

/**
 * Die vier Talent-Kategorien aus 5e 2024. Sie entscheiden, WANN ein Talent
 * genommen werden darf: Origin beim Hintergrund, General ab Stufe 4 (statt einer
 * Attributserhöhung), Fighting Style nur mit dem gleichnamigen Klassenmerkmal,
 * Epic Boon ab Stufe 19.
 *
 * Open5e nennt das Feld `type`; hier heißt es `category`, weil `type` im Rest der
 * App schon die Artefaktart bezeichnet (`activeFile.type`). Deutsche Labels in
 * `featsLibrary.ts` (`FEAT_CATEGORY_DE`) — hier steht nur das Vokabular, damit Zod
 * es ohne Umweg über die Anzeige-Schicht nutzen kann.
 */
export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon'] as const;
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

/**
 * Die sechs Kreaturengrößen, englisch → deutsch. EIN Vokabular für Monster UND Charaktere;
 * der Name ist historisch (die Tabelle entstand für den Monster-Statblock).
 *
 * Liegt hier statt in `types.ts`, weil zwei Schemas darauf stehen (`monsterSchema.size`,
 * `characterPropertiesSchema.size`) und ein Import aus `types.ts` in diese Datei ein Zyklus
 * wäre — `types.ts` liest Werte von hier. Dort steht der Re-Export.
 */
export const MONSTER_SIZES = {
  Tiny:        'Winzig',
  Small:       'Klein',
  Medium:      'Mittelgroß',
  Large:       'Groß',
  Huge:        'Riesig',
  Gargantuan:  'Gigantisch',
} as const;
export type MonsterSize = keyof typeof MONSTER_SIZES;
/** Dasselbe Vokabular als Liste — für `z.enum` und für Picker. */
export const MONSTER_SIZE_KEYS = Object.keys(MONSTER_SIZES) as [MonsterSize, ...MonsterSize[]];

/**
 * Lookup-Schlüssel eines Regelbegriffs: kleingeschrieben, OHNE jedes Leerzeichen.
 * Fängt Open5es Datenmüll ab — die v2-Kerntabellen enthalten „Na ture" (Druide)
 * und „In sight" (Magier), also eingestreute Leerzeichen mitten im Namen.
 */
const foldRuleName = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

function vocabularyLookup<T extends string>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((v) => [foldRuleName(v), v]));
}

const SKILL_LOOKUP = vocabularyLookup(SKILL_NAMES);
const ABILITY_LOOKUP = vocabularyLookup(ABILITY_NAMES);
const WEAPON_LOOKUP = vocabularyLookup(WEAPON_CATEGORIES);
// „Shield" (Singular) kommt in der Prosa ebenso vor wie „Shields".
const ARMOR_LOOKUP = new Map([...vocabularyLookup(ARMOR_TRAININGS), ['shield', 'Shields' as ArmorTraining]]);

/** Erkennt eine Fertigkeit; null, wenn der Begriff keine ist. */
export const readSkillName = (raw: string): SkillName | null =>
  SKILL_LOOKUP.get(foldRuleName(raw.replace(/\bskills?\b/gi, ''))) ?? null;

/** Erkennt ein Attribut (englischer Name); null, wenn der Begriff keines ist. */
export const readAbilityName = (raw: string): AbilityName | null => ABILITY_LOOKUP.get(foldRuleName(raw)) ?? null;

/** Erkennt eine Waffenkategorie; null bei allem, was eine Einzel-/Sonderregel ist. */
export const readWeaponCategory = (raw: string): WeaponCategory | null =>
  WEAPON_LOOKUP.get(foldRuleName(raw.replace(/\bweapons?\b/gi, ''))) ?? null;

/** Erkennt eine Rüstungsstufe; null bei allem Übrigen (inkl. „None"). */
export const readArmorTraining = (raw: string): ArmorTraining | null =>
  ARMOR_LOOKUP.get(foldRuleName(raw.replace(/\barmou?r\b/gi, '').replace(/\btraining\b/gi, ''))) ?? null;

/**
 * Zerlegt eine SRD-Aufzählung („Light, Medium, and Heavy armor and Shields",
 * „Animal Handling, Athletics, or Survival") in ihre Glieder. Trennt an Kommas
 * sowie an „and"/„or" und wirft Füllwörter weg.
 */
export function splitRuleList(raw: string): string[] {
  return raw
    .split(/,|\band\b|\bor\b/gi)
    .map((s) => s.trim().replace(/^(?:the|a|an)\s+/i, '').replace(/[.;]+$/, '').trim())
    .filter((s) => s && !/^none$/i.test(s));
}

/**
 * Liest eine Fertigkeits-Aufzählung. Wirft bei einem unbekannten Glied — beide
 * Quellen (Open5e v2 und der deutsche SRD-Auszug) sind bekannt deckungsgleich,
 * eine Abweichung ist also ein Parser-Fehler und soll sichtbar werden statt
 * still eine Fertigkeit zu verschlucken.
 */
export function parseSkillNames(raw: string, context = 'Fertigkeitsliste'): SkillName[] {
  const out: SkillName[] = [];
  for (const part of splitRuleList(raw)) {
    const skill = readSkillName(part);
    if (!skill) throw new Error(`${context}: unbekannte Fertigkeit "${part}" (aus "${raw}")`);
    if (!out.includes(skill)) out.push(skill);
  }
  return out;
}

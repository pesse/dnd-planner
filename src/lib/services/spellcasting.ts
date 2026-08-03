/**
 * Zauberwirken als Regel-Schicht (kein LLM), einzige Stelle, die diese Zahlen aus der
 * Klassentabelle liest. 5e 2024 kennt kein „Spells Known" mehr — was DAUERHAFT am Charakter
 * stehen kann, entscheidet allein das `PrepRegime`.
 */
import type { AbilityKey, ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { FeatureRider } from '$lib/schemas/levelUp';
import { resolveClass } from '$lib/spellLibrary';
import { columnValue, getProgressionByKey, spellSlotsAt } from './classProgression';
import { keySlug } from '$lib/utils/text';

/**
 * - `spellbook`  Magier: Buch = bekannt-Bestand, Vorbereitung eine Teilmenge → beides persistiert.
 * - `open-list`  Kleriker/Druide: bekannt IST die Klassenliste → nur die Vorbereitung wird gespeichert.
 * - `fixed-list` alle übrigen: die Liste ist quasi-dauerhaft und damit der bekannt-Bestand.
 */
export type PrepRegime = 'spellbook' | 'open-list' | 'fixed-list';

/**
 * Bewusst eine Code-Tabelle statt Prosa-Erkennung: der Wortlaut der Merkmalsbeschreibung ist
 * keine Schnittstelle, und ein Fehlgriff unterschlüge beim Magier die zweite Wahl. Homebrew
 * fällt auf `fixed-list` — der sichere Fall, weil dort die Auswahl persistiert wird.
 */
const OPEN_LIST_CLASSES = /^(cleric|druid)$/i;

export const CASTER_ABILITY_KEY: Record<string, AbilityKey> = {
  bard: 'cha', cleric: 'wei', druid: 'wei', paladin: 'cha',
  ranger: 'wei', sorcerer: 'cha', warlock: 'cha', wizard: 'int',
};

/** Keine zweite Label-Tabelle — die Anzeigeform kommt aus `schemas/abilities`. */
import { ABILITY_LABEL } from '$lib/schemas/abilities';
export { ABILITY_LABEL as CASTER_ABILITY_DE };

// EINE Formel für Klassen-Zauberwirken UND Merkmals-Zugänge: zwei Fassungen laufen
// auseinander, sobald eine davon angefasst wird.
export const spellSaveDC = (profBonus: number, abilityMod: number): number => 8 + profBonus + abilityMod;
export const spellAttackBonus = (profBonus: number, abilityMod: number): number => profBonus + abilityMod;

/**
 * Steht nur in der Prosa („It starts with six level 1 Wizard spells") — Open5e emittiert
 * dafür keine Tabellenspalte.
 */
export const SPELLBOOK_START_SPELLS = 6;

/**
 * Der EXAKTE Name ist nur der Fallback für Merkmale ohne `grantsChoice`: „Spell Mastery",
 * „Magical Secrets" und „Signature Spells" dürfen nicht mitfallen, sie tragen eigene
 * Mechanik. Ginge das Merkmal in die KI-Analyse, erfände das Modell Zauberlisten.
 */
const CASTING_FEATURE_NAMES = /^(spellcasting|pact magic|zauberwirken|paktmagie)$/i;

export function isSpellcastingFeature(f: ClassFeature): boolean {
  if (f.grantsChoice) return f.grantsChoice.kind === 'spellcasting';
  return CASTING_FEATURE_NAMES.test(f.name.trim()) || CASTING_FEATURE_NAMES.test((f.nameDe ?? '').trim());
}

/** In 5e 2024 nur der Magier. */
export function isSpellbookClass(sourceKey: string, klasseName = ''): boolean {
  return /wizard/i.test(sourceKey) || /magier/i.test(klasseName);
}

export function cantripCount(prog: ClassProgression, level: number): number {
  const raw = columnValue(prog, 'Cantrips', level) ?? columnValue(prog, 'Cantrips Known', level);
  const n = Number(String(raw ?? '').match(/(\d+)/)?.[1] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Mehrere Spaltennamen, weil der exakte 2024-Name je Quelle variiert. */
const PREPARED_COLUMNS = ['Prepared Spells', 'Spells Prepared', 'Prepared Spell Count'];
const KNOWN_COLUMNS = ['Spells Known', 'Known Spells'];
export function preparedOrKnownCount(
  prog: ClassProgression,
  level: number,
): { count: number; kind: 'prepared' | 'known' | 'none' } {
  for (const c of PREPARED_COLUMNS) {
    const raw = columnValue(prog, c, level);
    if (raw != null) return { count: Number(String(raw).match(/(\d+)/)?.[1] ?? 0) || 0, kind: 'prepared' };
  }
  for (const c of KNOWN_COLUMNS) {
    const raw = columnValue(prog, c, level);
    if (raw != null) return { count: Number(String(raw).match(/(\d+)/)?.[1] ?? 0) || 0, kind: 'known' };
  }
  return { count: 0, kind: 'none' };
}

export function maxSpellLevelAt(prog: ClassProgression, level: number): number {
  const slots = spellSlotsAt(prog, level);
  for (let i = slots.length - 1; i >= 0; i--) if ((slots[i] ?? 0) > 0) return i + 1;
  return 0;
}

export interface SpellcastingOffer {
  /** false = die Klasse wirkt auf DIESER Stufe nicht. */
  isCaster: boolean;
  regime: PrepRegime;
  klasseName: string;
  /** Englischer Bibliotheks-Key für den Zauberfilter; leer, wenn unauflösbar. */
  spellClass: string;
  ability: AbilityKey | null;
  maxSpellLevel: number;
  cantrips: number;
  /** Nur `spellbook`, sonst 0. */
  known: number;
  prepared: number;
}

const emptyOffer = (): SpellcastingOffer => ({
  isCaster: false, regime: 'fixed-list', klasseName: '', spellClass: '',
  ability: null, maxSpellLevel: 0, cantrips: 0, known: 0, prepared: 0,
});

/** Wie `masteryOffer` beschafft der AUFRUFER die Offer — Wizard und Bogen entscheiden anders. */
export async function spellcastingOffer(input: {
  classKey: string;
  klasseName: string;
  level: number;
}): Promise<SpellcastingOffer> {
  if (!input.classKey) return emptyOffer();
  const prog = await getProgressionByKey(input.classKey);
  if (!prog) return emptyOffer();

  const level = Math.min(20, Math.max(1, input.level));
  const slug = keySlug(input.classKey);
  const prepared = preparedOrKnownCount(prog, level).count;
  const spellbook = isSpellbookClass(input.classKey, input.klasseName);

  return {
    isCaster: prog.casterType !== 'NONE' && prepared > 0,
    regime: spellbook ? 'spellbook' : OPEN_LIST_CLASSES.test(slug) ? 'open-list' : 'fixed-list',
    klasseName: input.klasseName,
    spellClass: resolveClass(input.klasseName) ?? (CASTER_ABILITY_KEY[slug] ? slug : ''),
    ability: CASTER_ABILITY_KEY[slug] ?? null,
    maxSpellLevel: maxSpellLevelAt(prog, level),
    cantrips: cantripCount(prog, level),
    // Das Buch startet auf Stufe 1 mit 6 Zaubern und wächst danach um 2 je Stufe.
    known: spellbook ? SPELLBOOK_START_SPELLS + Math.max(0, level - 1) * 2 : 0,
    prepared,
  };
}

/**
 * Kann nur wachsen, nie schrumpfen — deshalb darf die Oberfläche das Kontingent nachträglich
 * erhöhen, ohne getroffene Wahlen zu entwerten.
 */
export function riderExtras(riders: FeatureRider[]): { cantrips: number; prepared: number } {
  return riders.reduce(
    (acc, r) => ({ cantrips: acc.cantrips + r.extraCantrips, prepared: acc.prepared + r.extraPreparedCount }),
    { cantrips: 0, prepared: 0 },
  );
}

/** `"0::Licht"`, `"1::Magisches Geschoss"` — ein Grad-behafteter Pick als flacher String. */
export function encodePick(level: number, name: string): string {
  return `${level}::${name}`;
}

export function decodePick(v: string): { level: number; name: string } {
  const i = v.indexOf('::');
  if (i < 0) return { level: 0, name: v };
  return { level: Number(v.slice(0, i)) || 0, name: v.slice(i + 2) };
}

export interface SpellSelection {
  /** Kanonische Namen — so führt sie das Charakter-Schema. */
  cantrips: string[];
  byLevel: Map<number, { name: string; prepared: boolean }[]>;
}

/**
 * Entscheidet die EINE Regelfrage: was ist „vorbereitet"? Nur im `spellbook`-Regime sind
 * „bekannt" und „vorbereitet" verschiedene Mengen, sonst IST die Auswahl die Vorbereitung.
 * `featurePicks` sind stets vorbereitet und zählen nicht gegen das Klassenkontingent.
 */
export function buildSpellSelection(input: {
  regime: PrepRegime;
  cantripPicks: string[];
  knownPicks: string[];
  preparedPicks: string[];
  featurePicks: string[];
}): SpellSelection {
  const cantrips: string[] = [];
  const byLevel = new Map<number, { name: string; prepared: boolean }[]>();

  const put = (level: number, name: string, prepared: boolean): void => {
    if (!name.trim()) return;
    if (level <= 0) {
      if (!cantrips.includes(name)) cantrips.push(name);
      return;
    }
    const arr = byLevel.get(level) ?? [];
    const seen = arr.find((e) => e.name === name);
    // Doppelt gewählt (Klassenkontingent + Merkmal): vorbereitet gewinnt.
    if (seen) seen.prepared = seen.prepared || prepared;
    else arr.push({ name, prepared });
    byLevel.set(level, arr);
  };

  for (const v of input.cantripPicks) put(0, decodePick(v).name, true);
  for (const v of input.knownPicks) {
    const { level, name } = decodePick(v);
    put(level, name, input.regime === 'spellbook' ? input.preparedPicks.includes(v) : true);
  }
  for (const v of input.featurePicks) {
    const { level, name } = decodePick(v);
    put(level, name, true);
  }
  return { cantrips, byLevel };
}

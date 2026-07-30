/**
 * Zauberwirken als Regel-Schicht (kein LLM): wie viele Zaubertricks, wie viele Zauber
 * „bekannt" und wie viele vorbereitet — abgeleitet aus der lokalen Klassentabelle.
 *
 * Einzige Stelle, die diese Zahlen aus der Progression liest; `levelUp.ts` (Aufstieg),
 * `assembleCharacter.ts` (Wizard) und die Wizard-Oberfläche greifen hierauf zu.
 *
 * **5e 2024 kennt kein „Spells Known" mehr** — alle acht Zauberwirker haben nur die Spalte
 * „Prepared Spells". Der Unterschied steckt im Abschnitt „Changing Your Prepared Spells"
 * der jeweiligen `*_spellcasting`-Merkmale und ist als `PrepRegime` modelliert: er
 * entscheidet, was überhaupt DAUERHAFT am Charakter stehen kann.
 */
import type { AbilityKey, ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { FeatureRider } from '$lib/schemas/levelUp';
import { resolveClass } from '$lib/spellLibrary';
import { columnValue, getProgressionByKey, spellSlotsAt } from './classProgression';

/**
 * - `spellbook`  Magier: das Buch ist der bekannt-Bestand, die Vorbereitung eine freie
 *                Teilmenge daraus → beides wird gewählt und beides persistiert.
 * - `open-list`  Kleriker/Druide: der bekannt-Bestand IST die ganze Klassenliste und nach
 *                jeder Langen Rast frei umstellbar → es gibt nichts dauerhaft zu speichern,
 *                nur die aktuelle Vorbereitung.
 * - `fixed-list` alle übrigen: die Liste ist quasi-dauerhaft (ein Tausch pro Rast bzw. pro
 *                Stufe) → sie ist der de-facto bekannt-Bestand.
 */
export type PrepRegime = 'spellbook' | 'open-list' | 'fixed-list';

/**
 * Nur diese beiden Klassen dürfen ihre Vorbereitung nach einer Langen Rast KOMPLETT
 * umstellen („replacing any of the spells"). Bewusst eine Code-Tabelle und keine
 * Prosa-Erkennung: der Wortlaut der Merkmalsbeschreibung ist keine Schnittstelle, und ein
 * Fehlgriff würde beim Magier die zweite Wahl unterschlagen. Homebrew fällt auf
 * `fixed-list` — der sichere Fall, weil dort die Auswahl persistiert wird.
 */
const OPEN_LIST_CLASSES = /^(cleric|druid)$/i;

/** Zauberattribut je Grundklasse (App-Schlüssel). */
export const CASTER_ABILITY_KEY: Record<string, AbilityKey> = {
  bard: 'cha', cleric: 'wei', druid: 'wei', paladin: 'cha',
  ranger: 'wei', sorcerer: 'cha', warlock: 'cha', wizard: 'int',
};

export const CASTER_ABILITY_DE: Record<AbilityKey, string> = {
  str: 'Stärke', ges: 'Geschicklichkeit', kon: 'Konstitution',
  int: 'Intelligenz', wei: 'Weisheit', cha: 'Charisma',
};

// EINE Formel für Klassen-Zauberwirken UND Merkmals-Zugänge (Magiekundiger): zwei Fassungen
// laufen auseinander, sobald eine davon angefasst wird.
export const spellSaveDC = (profBonus: number, abilityMod: number): number => 8 + profBonus + abilityMod;
export const spellAttackBonus = (profBonus: number, abilityMod: number): number => profBonus + abilityMod;

/**
 * Zauber, mit denen das Zauberbuch des Magiers auf Stufe 1 STARTET. Steht nur in der
 * Prosa („It starts with six level 1 Wizard spells of your choice") — Open5e emittiert
 * dafür keine Tabellenspalte, so wie `levelUpMachine` auch die 2 je Folgestufe hartkodiert.
 */
export const SPELLBOOK_START_SPELLS = 6;

/**
 * Ist dies das Zauberwirken-Merkmal der Klasse? Primär DEKLARATIV über `grantsChoice`
 * (offen für Homebrew, siehe `featureChoiceGrantSchema` in shared.ts); trägt das Merkmal ein
 * `grantsChoice`, ist dessen `kind` maßgeblich. Fallback für noch nicht gepflegte Merkmale:
 * der EXAKTE Name — „Spell Mastery", „Magical Secrets" oder „Signature Spells" dürfen nicht
 * mitfallen, denn die tragen echte, eigene Mechanik.
 *
 * Wozu: solange das Merkmal in die KI-Merkmalsanalyse geht, macht seine Prosa („You know
 * three Wizard cantrips of your choice") aus dem Modell einen Zauberlisten-Erfinder. Die
 * Zahl steht in der Stufentabelle, die Namen stehen in `vault/spells`.
 */
const CASTING_FEATURE_NAMES = /^(spellcasting|pact magic|zauberwirken|paktmagie)$/i;

export function isSpellcastingFeature(f: ClassFeature): boolean {
  if (f.grantsChoice) return f.grantsChoice.kind === 'spellcasting';
  return CASTING_FEATURE_NAMES.test(f.name.trim()) || CASTING_FEATURE_NAMES.test((f.nameDe ?? '').trim());
}

/** Klasse mit Zauberbuch (nimmt Zauber dauerhaft auf) — in 5e 2024 nur der Magier. */
export function isSpellbookClass(sourceKey: string, klasseName = ''): boolean {
  return /wizard/i.test(sourceKey) || /magier/i.test(klasseName);
}

/** Zaubertrick-Anzahl aus der (offenen) Spaltenmap; robust gegen Spaltennamen. */
export function cantripCount(prog: ClassProgression, level: number): number {
  const raw = columnValue(prog, 'Cantrips', level) ?? columnValue(prog, 'Cantrips Known', level);
  const n = Number(String(raw ?? '').match(/(\d+)/)?.[1] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Anzahl vorbereitbarer Zauber (2024) bzw. bekannter Zauber (known-Caster) auf einer
 * Stufe. Robust gegen Spaltennamen (der exakte 2024-Spaltenname variiert je Quelle).
 * Rückgabe 0, wenn keine passende Spalte existiert (Nicht-Zauberwirker).
 */
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

/** Höchster Zaubergrad, für den auf dieser Stufe Plätze existieren (0 = keine). */
export function maxSpellLevelAt(prog: ClassProgression, level: number): number {
  const slots = spellSlotsAt(prog, level);
  for (let i = slots.length - 1; i >= 0; i--) if ((slots[i] ?? 0) > 0) return i + 1;
  return 0;
}

export interface SpellcastingOffer {
  /** false = die Klasse wirkt auf dieser Stufe nicht (Kämpfer, Barbar, Schurke, Mönch). */
  isCaster: boolean;
  regime: PrepRegime;
  /** Anzeigename der Klasse („Magier"). */
  klasseName: string;
  /** Englischer Bibliotheks-Key für den Zauberfilter („wizard"); leer, wenn unauflösbar. */
  spellClass: string;
  ability: AbilityKey | null;
  maxSpellLevel: number;
  /** Zu wählende Zaubertricks (Spalte „Cantrips"; 0 bei Paladin/Waldläufer). */
  cantrips: number;
  /** Nur `spellbook`: Zauber, die ins Buch aufgenommen werden. Sonst 0. */
  known: number;
  /** Zu wählende/vorzubereitende Zauber ab Grad 1 (Spalte „Prepared Spells"). */
  prepared: number;
}

const emptyOffer = (): SpellcastingOffer => ({
  isCaster: false, regime: 'fixed-list', klasseName: '', spellClass: '',
  ability: null, maxSpellLevel: 0, cantrips: 0, known: 0, prepared: 0,
});

/**
 * Kontingent + Filter für eine Klasse auf einer Stufe. Wie `masteryOffer` beschafft der
 * AUFRUFER die Offer, weil Wizard und Charakterbogen an unterschiedlicher Stelle darüber
 * entscheiden (optionaler Schritt vs. Panel-Sichtbarkeit).
 */
export async function spellcastingOffer(input: {
  classKey: string;
  klasseName: string;
  level: number;
}): Promise<SpellcastingOffer> {
  if (!input.classKey) return emptyOffer();
  const prog = await getProgressionByKey(input.classKey);
  if (!prog) return emptyOffer();

  const level = Math.min(20, Math.max(1, input.level));
  const slug = input.classKey.split('_').pop() ?? '';
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
 * Kontingent-Aufschläge aus den KI-gedeuteten Merkmals-Ridern („Urtümlicher Orden:
 * Thaumaturg" → ein zusätzlicher Zaubertrick). Kann nur wachsen, nie schrumpfen — deshalb
 * darf die Oberfläche das Kontingent nachträglich erhöhen, ohne getroffene Wahlen zu
 * entwerten.
 */
export function riderExtras(riders: FeatureRider[]): { cantrips: number; prepared: number } {
  return riders.reduce(
    (acc, r) => ({ cantrips: acc.cantrips + r.extraCantrips, prepared: acc.prepared + r.extraPreparedCount }),
    { cantrips: 0, prepared: 0 },
  );
}

// ── Kodierung für Auswahlen über mehrere Zaubergrade ────────────────────────────────
/** `"0::Licht"`, `"1::Magisches Geschoss"` — ein Grad-behafteter Pick als flacher String. */
export function encodePick(level: number, name: string): string {
  return `${level}::${name}`;
}

export function decodePick(v: string): { level: number; name: string } {
  const i = v.indexOf('::');
  if (i < 0) return { level: 0, name: v };
  return { level: Number(v.slice(0, i)) || 0, name: v.slice(i + 2) };
}

// ── Auswahl → Charakter-Zauberliste ─────────────────────────────────────────────────
export interface SpellSelection {
  /** Zaubertricks (Grad 0) als kanonische Namen — so führt sie das Charakter-Schema. */
  cantrips: string[];
  /** Zauber ab Grad 1, je Grad, mit Vorbereitungs-Markierung. */
  byLevel: Map<number, { name: string; prepared: boolean }[]>;
}

/**
 * Übersetzt die getroffenen Auswahlen in die beiden Senken des Charakter-Schemas und
 * entscheidet dabei die EINE Regelfrage: was ist „vorbereitet"?
 *
 * Nur im `spellbook`-Regime sind „bekannt" und „vorbereitet" verschiedene Mengen — der
 * Magier wählt beides, die 2 nicht vorbereiteten Zauber stehen bloß im Buch
 * (`prepared: false`). In allen anderen Regimen ist die Auswahl selbst die Vorbereitung:
 * bei `open-list` (Kleriker/Druide) ist der bekannt-Bestand die ganze Klassenliste und wird
 * deshalb GAR NICHT persistiert, bei `fixed-list` fallen beide Mengen zusammen.
 *
 * `featurePicks` (z.B. der Grad-1-Zauber aus „Magiekundiger") sind stets vorbereitet und
 * zählen nicht gegen das Klassenkontingent.
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

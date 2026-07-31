/**
 * Die Einheiten, in denen die Merkmals-Deutung spricht: was hereinkommt
 * (`GainedFeature`), was als Frage herausfällt (`AnalysisChoice`) und was zurückkommt
 * (`ResolvedChoice`).
 *
 * Neutrales Modul, weil elf Stellen davon abhängen — die KI-Aktion ist ein Erzeuger
 * dieser Typen, nicht ihr Besitzer. Vorher lagen sie in `featureEffectsAction`, und
 * `levelUpMachine` schloss damit den einzigen Import-Zyklus in `src/lib`.
 */
import type { DeclaredFeature } from '../declaredFeature';

/**
 * Einheitliche Eingabe-Einheit für die Effekt-Deutung (Merkmal ODER Talent).
 *
 * Die deutschen Felder gehen NICHT an die Deutungs-Calls (siehe
 * `buildFeatureEffectsInput`) — sie sind die Quelle der beiden Übersetzungs-Calls.
 *
 * Erbt `DeclaredFeature`: damit speist eine `GainedFeature[]` die Deklarations-Strecke ohne
 * Projektion. Die Deklarationen reisen mit, gehen aber nicht ans Modell.
 */
export interface GainedFeature extends DeclaredFeature {
  desc: string; // Original-Regeltext (EN) — maßgeblich für die Mechanik
  descDe?: string; // Übersetzung — Quelle der wörtlich zitierten deutschen Optionslabels
  gainedAt: number;
  choice?: string; // Bereits getroffene Entscheidung (EN) — verhindert, dass sie erneut gefragt wird
}

/**
 * Antwort auf eine erkannte Wahl. Bewusst MINIMAL: Frage, Optionen und Merkmal stehen
 * schon im Verlauf — sie erneut mitzuschicken lädt nur zu Widersprüchen ein.
 */
export interface ResolvedChoice {
  id: string;
  choice: string;
}

/** Knapper Klassen-Kontext für die Effekt-Deutung. */
export interface FeatureClassContext {
  klasseName: string;
  /** Leer, wenn die Klasse noch keine hat — bei der Merkmals-Deutung ist die Wahl aber
   *  immer schon gefallen, nie eine offene Frage. */
  subclassName: string;
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none';
  spellcastingAbility: string;
  toLevel: number;
}

/**
 * Eine erkannte, erzwungene Spielerwahl — treibt den Checkpoint.
 *
 * ZWEISPRACHIG, mit klarer Rollenteilung: die englischen Felder sind die kanonischen (sie
 * gehen an die KI zurück und werden am Charakter gespeichert), die `…De`-Felder sind die
 * Anzeige. Letztere kommen vom Übersetzungs-Call und sind leer, wenn er nicht lief oder
 * scheiterte — dann zeigt die Oberfläche Englisch, statt den Checkpoint zu verlieren.
 */
export interface AnalysisChoice {
  id: string;
  feature: string;
  /** Deutscher Anzeigename des Merkmals — kommt aus der Bibliothek, nie vom Modell. */
  featureDe: string;
  /** Bibliotheks-Key des Merkmals — Anker, unter dem die Antwort am Charakter landet. */
  featureKey: string;
  question: string;
  /**
   * `spell-pick` = die Wahl ist eine ZAUBER-Wahl („Eingeweihter der Magie": 2 Zaubertricks aus der
   * Klerikerliste). Dann trägt `options` bewusst NICHTS: die Namen kommen aus `vault/spells`,
   * gefiltert über `spellLevels` + `spellClass`. Sonst wären es erfundene Zauber.
   */
  type: 'choice' | 'multiselect' | 'text' | 'spell-pick';
  options: string[];
  /** Nur bei `spell-pick`: erlaubte Zaubergrade (0 = Zaubertrick). */
  spellLevels: number[];
  /** Nur bei `spell-pick`: englischer Klassen-Key der Zauberliste („cleric", „druid", „wizard"). */
  spellClass: string;
  /** Knappe Zusammenfassung der Konsequenzen (Tooltip); leer, wenn keine. */
  help: string;
  /** Je Option (Schlüssel = Options-Label) ihre konkrete Konsequenz, z.B. „Black"→„acid damage". */
  optionHelp: Record<string, string>;
  max: number;
  determinesFurtherEffects: boolean;
  /** false = Wahl pro Einsatz (Kanalisierte Göttlichkeit u.ä.) → wird nicht protokolliert. */
  isBuildDecision: boolean;
  // ── Anzeige-Fassung (Übersetzungs-Call; leer = Englisch anzeigen) ──
  questionDe: string;
  helpDe: string;
  /** Parallel zu `options`: gleiche Länge und Reihenfolge, sonst leer. */
  optionsDe: string[];
  /** Geschlüsselt mit dem ENGLISCHEN Options-Label — dem stabilen Wert der Auswahl. */
  optionHelpDe: Record<string, string>;
}

/** Anzeige-Label einer Option: Übersetzung, wenn vorhanden, sonst der englische Wert. */
export function optionLabel(choice: AnalysisChoice, index: number): string {
  return choice.optionsDe[index]?.trim() || choice.options[index] || '';
}

/**
 * Die getroffene Antwort (englische Werte, bei Mehrfachauswahl komma-verbunden) als deutsche
 * Anzeige. Was in den Optionen nicht vorkommt, bleibt stehen — Freitext und Zaubernamen
 * haben kein Optionspaar und sind schon die Anzeige.
 */
export function choiceLabelsDe(choice: AnalysisChoice, valueCsv: string): string {
  return valueCsv
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const i = choice.options.indexOf(v);
      return i >= 0 ? optionLabel(choice, i) : v;
    })
    .join(', ');
}

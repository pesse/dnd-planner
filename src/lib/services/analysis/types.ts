/**
 * Die Einheiten der Merkmals-Strecke. Neutral gehalten, weil die KI-Aktion nur ein
 * Erzeuger dieser Typen ist und nicht ihr Besitzer — bei ihr schlossen sie den einzigen
 * Import-Zyklus in `src/lib`.
 */
import type { SpellSchool } from '../../schemas/vocabulary';
import type { DeclaredFeature } from '../declaredFeature';

/**
 * Merkmal ODER Talent, eine Eingabe-Einheit für beides. Die deutschen Felder gehen NICHT
 * an den Notiz-Call, sie speisen den Übersetzungs-Call. Erbt `DeclaredFeature`, damit
 * dieselbe Liste die Deklarations-Strecke speist — auch das geht nicht ans Modell.
 */
export interface GainedFeature extends DeclaredFeature {
  desc: string; // Original-Regeltext (EN) — maßgeblich für die Mechanik
  descDe?: string; // Übersetzung — Quelle der wörtlich zitierten deutschen Optionslabels
  gainedAt: number;
  choice?: string; // Bereits getroffene Entscheidung (EN) — verhindert, dass sie erneut gefragt wird
}

export interface FeatureClassContext {
  klasseName: string;
  /** Leer, wenn die Klasse noch keine hat — hier ist die Wahl nie eine offene Frage. */
  subclassName: string;
  casterType: string; // FULL/HALF/NONE/…
  casterKind: 'prepared' | 'known' | 'none';
  spellcastingAbility: string;
  toLevel: number;
}

/**
 * Eine erzwungene Spielerwahl, zweisprachig mit klarer Rollenteilung: die englischen Felder
 * sind kanonisch (sie werden gespeichert und gehen als `<past_choices>` in Prompts), die
 * `…De`-Felder nur Anzeige. Fehlt ein deutscher Wortlaut, zeigt die Oberfläche Englisch
 * statt den Checkpoint zu verlieren.
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
   * Bei `spell-pick` trägt `options` bewusst NICHTS: die Namen kommen aus `vault/spells`,
   * gefiltert über `spellLevels` + `spellClass`. Sonst wären es erfundene Zauber.
   */
  type: 'choice' | 'multiselect' | 'text' | 'spell-pick';
  options: string[];
  /** Nur bei `spell-pick`: erlaubte Zaubergrade (0 = Zaubertrick). */
  spellLevels: number[];
  /** Nur bei `spell-pick`: englischer Klassen-Key der Zauberliste („cleric", „druid", „wizard"). */
  spellClass: string;
  /**
   * Nur bei `spell-pick` aus einer Deklaration (`pool.schools`): Zauberschulen, auf die die
   * Wahl eingegrenzt ist. Leer = alle — der KI-Weg kennt keine Schule, er füllt sie nie.
   */
  spellSchools: SpellSchool[];
  /**
   * `known` = die Zauber sind Bestand (Zauberbuch), nicht vorbereitet. Nur eine Deklaration
   * weiß das; ohne Quota bleibt es bei `prepared`, sonst behauptete die Änderung Wirkbarkeit.
   */
  spellTier: 'known' | 'prepared';
  /** Nur bei `spell-pick` aus einer Deklaration: Ziel-Quota, sonst leer (quellenloser Bestand). */
  sourceId: string;
  quotaId: string;
  max: number;
  /** false = Wahl pro Einsatz (Kanalisierte Göttlichkeit u.ä.) → wird nicht protokolliert. */
  isBuildDecision: boolean;
  questionDe: string;
  helpDe: string;
  /** Parallel zu `options`: gleiche Länge und Reihenfolge, sonst leer. */
  optionsDe: string[];
  /** Geschlüsselt mit dem ENGLISCHEN Options-Label — dem stabilen Wert der Auswahl. */
  optionHelpDe: Record<string, string>;
}

export function optionLabel(choice: AnalysisChoice, index: number): string {
  return choice.optionsDe[index]?.trim() || choice.options[index] || '';
}

/**
 * Was in den Optionen nicht vorkommt, bleibt stehen — Freitext und Zaubernamen haben kein
 * Optionspaar und sind schon die Anzeige.
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

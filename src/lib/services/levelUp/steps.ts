/**
 * Die explizite Aufstiegs-Zustandsmaschine: Schritt-Metadaten (Checkpoint vs.
 * deterministisch), die Übergangsfunktion und die Reihenfolge, an der ein
 * Dokument-Eintrag als „schon gelaufen" erkannt wird.
 */
import type { LevelUpDelta } from '../levelUp';

/**
 * Bei `checkpoint` hält die Maschine an und die UI rendert. `running` ist KEIN Step,
 * sondern transienter UI-Zustand der Komponente während eines async-Arbeitsschritts.
 */
export type StepKind = 'deterministic' | 'checkpoint';
export type StepId =
  | 'choose-class'
  | 'base-delta'
  | 'subclass-choice'
  | 'subclass-delta'
  | 'new-features'        // Checkpoint: die neuen Merkmale vorstellen, bevor gewählt wird
  | 'declared-choices'    // Wahlen aus der Bibliothek lesen
  | 'feature-choices'
  | 'feature-effects'     // Rider der Deklarationen
  | 'player-decisions'
  | 'assemble-decisions'
  | 'feat-choice'
  | 'feat-links'
  | 'feat-choices'
  | 'feat-effects'        // Rider der Talent-Deklarationen
  | 'ongoing-effects'
  | 'feature-notes'       // je Merkmal eine Bogenzeile
  | 'class-features'      // Checkpoint: der Bogentext zum Nachbearbeiten
  | 'review'
  | 'done';

export const STEP_META: Record<StepId, { kind: StepKind; label: string }> = {
  'choose-class':      { kind: 'checkpoint',    label: 'Klasse & Zielstufe' },
  'base-delta':        { kind: 'deterministic', label: 'Grundwerte' },
  'subclass-choice':   { kind: 'checkpoint',    label: 'Subklasse' },
  'subclass-delta':    { kind: 'deterministic', label: 'Subklasse' },
  'new-features':      { kind: 'checkpoint',    label: 'Neue Merkmale' },
  'declared-choices':  { kind: 'deterministic', label: 'Merkmals-Wahlen' },
  'feature-choices':   { kind: 'checkpoint',    label: 'Merkmals-Wahlen' },
  'feature-effects':   { kind: 'deterministic', label: 'Merkmals-Effekte' },
  'player-decisions':  { kind: 'checkpoint',    label: 'Entscheidungen' },
  'assemble-decisions':{ kind: 'deterministic', label: 'Entscheidungen' },
  'feat-choice':       { kind: 'checkpoint',    label: 'Talente' },
  'feat-links':        { kind: 'deterministic', label: 'Talente' },
  'feat-choices':      { kind: 'checkpoint',    label: 'Talent-Wahlen' },
  'feat-effects':      { kind: 'deterministic', label: 'Talent-Effekte' },
  'ongoing-effects':   { kind: 'deterministic', label: 'Fortlaufende Effekte' },
  'feature-notes':     { kind: 'deterministic', label: 'Merkmals-Notizen' },
  'class-features':    { kind: 'checkpoint',    label: 'Klassenmerkmale' },
  'review':            { kind: 'checkpoint',    label: 'Überprüfung' },
  'done':              { kind: 'checkpoint',    label: 'Fertig' },
};

export const isCheckpoint = (s: StepId): boolean => STEP_META[s].kind === 'checkpoint';

export interface AdvanceCtx {
  delta: LevelUpDelta;
  featsToPick: number;  // countFeatsToPick(delta, answers, conditional)
  styleWork: number;    // neue plus tauschbare Kampfstile
  baseChoices: number;  // deklarierte Wahlen der Klassen- und Subklassen-Merkmale
  featChoices: number;  // deklarierte Wahlen der gewählten Talente
}

/**
 * Bewusst eine lineare Funktion statt einer Übergangstabelle — die Verzweigungen bleiben
 * lesbar. Der Aufrufer läuft Arbeitsschritte ab, bis ein Checkpoint kommt:
 * `while (!isCheckpoint(next)) { await run(next); next = advance(next, ctx); }`.
 */
export function advance(from: StepId, ctx: AdvanceCtx): StepId {
  switch (from) {
    case 'choose-class':       return 'base-delta';
    case 'base-delta':         return needsSubclassChoice(ctx.delta) ? 'subclass-choice' : 'new-features';
    case 'subclass-choice':    return 'subclass-delta';
    case 'subclass-delta':     return 'new-features';
    case 'new-features':       return 'declared-choices';
    // Wahlen gelesen → bei welchen anhalten → Rider, mit der getroffenen Entscheidung.
    case 'declared-choices':   return ctx.baseChoices > 0 ? 'feature-choices' : 'feature-effects';
    case 'feature-choices':    return 'feature-effects';
    case 'feature-effects':    return 'player-decisions';
    case 'player-decisions':   return 'assemble-decisions';
    case 'assemble-decisions': return ctx.featsToPick > 0 || ctx.styleWork > 0 ? 'feat-choice' : 'ongoing-effects';
    case 'feat-choice':        return 'feat-links';
    case 'feat-links':         return ctx.featChoices > 0 ? 'feat-choices' : 'feat-effects';
    case 'feat-choices':       return 'feat-effects';
    case 'feat-effects':       return 'ongoing-effects';
    // Die Notizen erst HIER: davor stehen Basis- und Talentmerkmale nicht zusammen fest.
    case 'ongoing-effects':    return 'feature-notes';
    case 'feature-notes':      return 'class-features';
    case 'class-features':     return 'review';
    case 'review':             return 'done';
    case 'done':               return 'done';
  }
}

/**
 * Zeitliche Gesamtreihenfolge ALLER Schritte — verhindert, dass das Dokument Einträge
 * künftiger Schritte zeigt (Trefferpunkte VOR dem Entscheidungs-Checkpoint).
 */
const TIMELINE: StepId[] = [
  'choose-class', 'base-delta', 'subclass-choice', 'subclass-delta', 'new-features',
  'declared-choices', 'feature-choices', 'feature-effects',
  'player-decisions', 'assemble-decisions', 'feat-choice', 'feat-links',
  'feat-choices', 'feat-effects', 'ongoing-effects',
  'feature-notes', 'class-features', 'review', 'done',
];

export function stepReached(current: StepId, step: string): boolean {
  const ci = TIMELINE.indexOf(current);
  const si = TIMELINE.indexOf(step as StepId);
  if (ci < 0 || si < 0) return true; // unbekannter Schritt → nicht herausfiltern
  return ci >= si;
}

/** `homebrew` fällt hier durch — ohne Progression gibt es keine Optionen. */
export function needsSubclassChoice(delta: LevelUpDelta): boolean {
  return delta.triggersSubclassChoice && !delta.subclassKey && delta.subclassOptions.length > 0;
}

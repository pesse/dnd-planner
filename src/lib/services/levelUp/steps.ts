/**
 * Die explizite Aufstiegs-Zustandsmaschine: Schritt-Metadaten (Checkpoint vs.
 * deterministisch vs. KI), die Übergangsfunktion und die Reihenfolge, an der ein
 * Dokument-Eintrag als „schon gelaufen" erkannt wird.
 */
import type { LevelUpDelta } from '../levelUp';

/**
 * Ein Schritt der Aufstiegs-Zustandsmaschine. `checkpoint` = die Maschine hält an
 * und die UI rendert (Nutzer-Interaktion nötig); `deterministic`/`ai` = Arbeits-
 * schritte, die die Komponente ohne Halt durchläuft. `running` ist KEIN Step,
 * sondern transienter UI-Zustand der Komponente während eines async-Arbeitsschritts.
 */
export type StepKind = 'deterministic' | 'ai' | 'checkpoint';
export type StepId =
  | 'choose-class'        // checkpoint
  | 'base-delta'          // det.
  | 'subclass-choice'     // checkpoint
  | 'subclass-delta'      // det.
  | 'feature-analysis'    // ai (Call 1: Choices ermitteln)
  | 'feature-choices'     // checkpoint (Wahlen direkt nach Call 1)
  | 'feature-effects'     // ai (Call C: finalisieren)
  | 'player-decisions'    // checkpoint
  | 'assemble-decisions'  // det.
  | 'feat-choice'         // checkpoint
  | 'feat-links'          // det.
  | 'feat-analysis'       // ai (Call 1, Talente)
  | 'feat-choices'        // checkpoint (Talent-Wahlen)
  | 'feat-effects'        // ai (Call C, Talente)
  | 'narrative'           // ai (C)
  | 'ongoing-effects'     // ai (F)
  | 'class-features-merge'// ai (D: Freitext + sheetNotes verschmelzen)
  | 'class-features'      // checkpoint (+ D erneut auf Klick)
  | 'review'              // checkpoint
  | 'done';               // terminal

export const STEP_META: Record<StepId, { kind: StepKind; label: string }> = {
  'choose-class':      { kind: 'checkpoint',    label: 'Klasse & Zielstufe' },
  'base-delta':        { kind: 'deterministic', label: 'Grundwerte' },
  'subclass-choice':   { kind: 'checkpoint',    label: 'Subklasse' },
  'subclass-delta':    { kind: 'deterministic', label: 'Subklasse' },
  'feature-analysis':  { kind: 'ai',            label: 'Merkmals-Analyse' },
  'feature-choices':   { kind: 'checkpoint',    label: 'Merkmals-Wahlen' },
  'feature-effects':   { kind: 'ai',            label: 'Merkmals-Effekte' },
  'player-decisions':  { kind: 'checkpoint',    label: 'Entscheidungen' },
  'assemble-decisions':{ kind: 'deterministic', label: 'Entscheidungen' },
  'feat-choice':       { kind: 'checkpoint',    label: 'Talente' },
  'feat-links':        { kind: 'deterministic', label: 'Talente' },
  'feat-analysis':     { kind: 'ai',            label: 'Talent-Analyse' },
  'feat-choices':      { kind: 'checkpoint',    label: 'Talent-Wahlen' },
  'feat-effects':      { kind: 'ai',            label: 'Talent-Effekte' },
  'narrative':         { kind: 'ai',            label: 'Narrativ' },
  'ongoing-effects':   { kind: 'ai',            label: 'Fortlaufende Effekte' },
  'class-features-merge': { kind: 'ai',         label: 'Klassenmerkmale' },
  'class-features':    { kind: 'checkpoint',    label: 'Klassenmerkmale' },
  'review':            { kind: 'checkpoint',    label: 'Überprüfung' },
  'done':              { kind: 'checkpoint',    label: 'Fertig' },
};

export const isCheckpoint = (s: StepId): boolean => STEP_META[s].kind === 'checkpoint';

/** Laufzeit-Kontext für die Übergangsentscheidung (aus dem Komponenten-State). */
export interface AdvanceCtx {
  delta: LevelUpDelta;
  featsToPick: number;  // countFeatsToPick(delta, answers)
  baseChoices: number;  // von der Merkmals-Analyse (Call 1) erkannte Wahlen
  featChoices: number;  // von der Talent-Analyse (Call 1) erkannte Wahlen
}

/**
 * Nächster Schritt nach `from`. Eine bewusst lineare, lesbare Funktion mit den
 * Verzweigungen des Ablaufs (Subklasse? / erkannte Wahlen? / Talente?) — KEINE rigide
 * Übergangstabelle. Merkmale (und Talente) laufen als Analyse → [Wahlen] → Effekte:
 * erkennt Call 1 erzwungene Wahlen, hält die Maschine DIREKT DANACH am Choice-Checkpoint
 * an; der finalisierende Effekt-Call folgt mit der getroffenen Entscheidung. Die Komponente
 * läuft Arbeitsschritte ab, bis ein Checkpoint kommt:
 * `while (!isCheckpoint(next)) { await run(next); next = advance(next, ctx); }`.
 */
export function advance(from: StepId, ctx: AdvanceCtx): StepId {
  switch (from) {
    case 'choose-class':       return 'base-delta';
    case 'base-delta':         return needsSubclassChoice(ctx.delta) ? 'subclass-choice' : 'feature-analysis';
    case 'subclass-choice':    return 'subclass-delta';
    case 'subclass-delta':     return 'feature-analysis';
    // Merkmale: Analyse (Call 1) → bei erkannten Wahlen anhalten → Effekte (Call C).
    case 'feature-analysis':   return ctx.baseChoices > 0 ? 'feature-choices' : 'feature-effects';
    case 'feature-choices':    return 'feature-effects';
    case 'feature-effects':    return 'player-decisions';
    case 'player-decisions':   return 'assemble-decisions';
    case 'assemble-decisions': return ctx.featsToPick > 0 ? 'feat-choice' : 'narrative';
    case 'feat-choice':        return 'feat-links';
    case 'feat-links':         return 'feat-analysis';
    // Talente: analog Analyse → [Wahlen] → Effekte.
    case 'feat-analysis':      return ctx.featChoices > 0 ? 'feat-choices' : 'feat-effects';
    case 'feat-choices':       return 'feat-effects';
    case 'feat-effects':       return 'narrative';
    case 'narrative':          return 'ongoing-effects';
    case 'ongoing-effects':    return 'class-features-merge';
    case 'class-features-merge': return 'class-features';
    case 'class-features':     return 'review';
    case 'review':             return 'done';
    case 'done':               return 'done';
  }
}

/**
 * Zeitliche Gesamtreihenfolge ALLER Schritte (Checkpoints + interne). Bestimmt, welche
 * Änderungen im Dokument bereits „gelaufen" sind: ein Schritt ist erreicht, sobald der
 * aktuelle Phasenstand ihn erreicht oder überschritten hat. Verhindert, dass das Dokument
 * Einträge künftiger Schritte zeigt (z.B. Trefferpunkte VOR dem Entscheidungs-Checkpoint).
 */
const TIMELINE: StepId[] = [
  'choose-class', 'base-delta', 'subclass-choice', 'subclass-delta',
  'feature-analysis', 'feature-choices', 'feature-effects',
  'player-decisions', 'assemble-decisions', 'feat-choice', 'feat-links',
  'feat-analysis', 'feat-choices', 'feat-effects', 'narrative', 'ongoing-effects',
  'class-features-merge', 'class-features', 'review', 'done',
];

/** Ist der (Builder-)Schritt `step` beim aktuellen Phasenstand `current` bereits gelaufen? */
export function stepReached(current: StepId, step: string): boolean {
  const ci = TIMELINE.indexOf(current);
  const si = TIMELINE.indexOf(step as StepId);
  if (ci < 0 || si < 0) return true; // unbekannter Schritt → nicht herausfiltern
  return ci >= si;
}

/**
 * Nächster Schritt nach `feature-effects`/`player-decisions`. Reine Skip-Logik;
 * die async-Arbeit (Delta, KI) orchestriert die Komponente. `homebrew` wird separat
 * behandelt (Rückfall auf den alten Frage-→-Vorschlag-KI-Pfad).
 */
export function needsSubclassChoice(delta: LevelUpDelta): boolean {
  return delta.triggersSubclassChoice && !delta.subclassKey && delta.subclassOptions.length > 0;
}

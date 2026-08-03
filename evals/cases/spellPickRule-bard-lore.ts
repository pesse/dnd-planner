/**
 * Eval-Case: trägt die spell-pick-Regel des Analyse-Prompts ihren Kunden?
 *
 * Gemessen wird „Magische Entdeckungen" (Barde 5→6, Kolleg des Wissens) — eines von fünf
 * Klassenmerkmalen, die eine Zauber-Wahl NICHT deklariert bekommen können und deshalb weiter am Modell hängen. Diese Strecke ist
 * damit die Entscheidungsgrundlage für den Prompt-Schnitt aus 1f: wer die Regel entfernen
 * will, muss zeigen, dass sie hier nichts leistet.
 *
 *   Call 1 — die Wahl muss entstehen: type spell-pick, Kontingent 2, Gradband 0–3,
 *            Liste als englischer Klassen-Key, keine erfundenen Zaubernamen.
 *   Call C — mit UNBEANTWORTETER Wahl: kein Zauber darf gewährt und keine Entscheidung
 *            protokolliert werden (die Zauber wählt der Spieler im Checkpoint).
 */
import { analyzeFeatureEffects, finalizeFeatureEffects, type FeatureAnalysis, type FeatureEffectsContext } from '../../src/lib/services/aiActions/featureEffectsAction';
import { type AnalysisChoice } from '../../src/lib/services/analysis/types';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { asAnalysis, asEffects, isSheetReady, sheetNotes, SHEET_NOTE_LIMIT, type StepResult } from './featureEffectsStep';
import {
  ALLOWED_LISTS,
  ALLOWED_SPELL_LEVELS,
  bardClassContext,
  EXPECTED_PICK_COUNT,
  loadMagicalDiscoveries,
} from '../../tests/fixtures/bard-l6-college-of-lore';

const spellPicks = (a: FeatureAnalysis): AnalysisChoice[] => a.choices.filter((c) => c.type === 'spell-pick');

/** Die eine erwartete Zauber-Wahl; mehr als eine ist selbst ein Befund (Bänder aufgeteilt). */
const onlyPick = (a: FeatureAnalysis | null): AnalysisChoice | null => {
  const picks = a ? spellPicks(a) : [];
  return picks.length === 1 ? picks[0] : null;
};

/** Der Tausch-Halbsatz („whenever you gain a Bard level, you can replace one") ist Tisch-Sache. */
const replaceRe = /replace|ersetz|tausch|swap/i;

const analyzeCore: Checks<StepResult> = {
  'stellt genau eine Zauber-Wahl (type spell-pick)': (r) => onlyPick(asAnalysis(r)) !== null,
  [`Kontingent ist ${EXPECTED_PICK_COUNT}`]: (r) => onlyPick(asAnalysis(r))?.max === EXPECTED_PICK_COUNT,
  // Die harte Regelgrenze: ein Grad-4-Zauber ist auf Stufe 6 nicht wählbar („a spell for
  // which you have spell slots"). Ein zu weites Band lässt den Spieler regelwidrig wählen.
  'kein Zaubergrad über 3': (r) => {
    const p = onlyPick(asAnalysis(r));
    return !!p && p.spellLevels.length > 0 && p.spellLevels.every((l) => ALLOWED_SPELL_LEVELS.includes(l));
  },
  'Gradband umfasst Zaubertricks': (r) => onlyPick(asAnalysis(r))?.spellLevels.includes(0) === true,
  // `spellClass` filtert die Bibliothek im SpellPicker. Leer = der Spieler bekommt ALLE
  // Zauber angeboten, auch solche, die das Merkmal nicht gewährt (der Fehler, den die
  // Talent-Messung am 30.07. in 10 von 10 Läufen zeigte).
  'Liste ist einer der drei erlaubten Klassen-Keys': (r) => {
    const p = onlyPick(asAnalysis(r));
    return !!p && ALLOWED_LISTS.includes(p.spellClass);
  },
  // Der Spieler wählt aus der lokalen Bibliothek — jeder hier genannte Name wäre erfunden.
  'nennt keine Zaubernamen in den Optionen': (r) => {
    const p = onlyPick(asAnalysis(r));
    return !!p && p.options.length === 0;
  },
  // K1: eine Wahl, die die Regeln bei jedem Aufstieg neu öffnen, gehört nicht ins Manifest.
  'macht aus dem Tausch-Halbsatz keine Wahl': (r) => {
    const a = asAnalysis(r);
    return !!a && !a.choices.some((c) => replaceRe.test([c.question, ...c.options].join(' ')));
  },
  // Eine Zauber-Wahl entscheidet nichts weiter — die gewählten Zauber SIND die Wirkung.
  'nicht blockiert': (r) => asAnalysis(r)?.blocked === false,
};

const analyzeSoft: Checks<StepResult> = {
  'Gradband ist vollständig 0–3': (r) => {
    const p = onlyPick(asAnalysis(r));
    return !!p && ALLOWED_SPELL_LEVELS.every((l) => p.spellLevels.includes(l));
  },
  'erdet keinen Zauber (es ist nichts gewährt)': (r) => asAnalysis(r)?.spellsToGround.length === 0,
};

const finalizeCore: Checks<StepResult> = {
  // Die Wahl ist unbeantwortet: jeder Zaubername hier wäre geraten und stünde am Charakter.
  'gewährt keinen Zauber (die Wahl ist offen)': (r) =>
    asEffects(r)?.riders.every((x) => x.grantedSpells.length === 0) ?? false,
  'protokolliert keine unbeantwortete Wahl': (r) =>
    asEffects(r)?.riders.every((x) => x.decisions.length === 0) ?? false,
  // Das Kontingent gehört in die Wahl, nicht in `extraPreparedCount`: die zwei Zauber sind
  // „always prepared" und zählen NICHT gegen das Kontingent der Klasse.
  'bläht das Vorbereitungs-Kontingent nicht auf': (r) =>
    asEffects(r)?.riders.every((x) => (x.extraPreparedCount ?? 0) === 0) ?? false,
};

const finalizeSoft: Checks<StepResult> = {
  'liefert mindestens eine Bogen-Notiz': (r) => sheetNotes(r).length > 0,
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
};

export async function buildBardLoreCases(): Promise<EvalCase<StepResult>[]> {
  const features = await loadMagicalDiscoveries();
  if (features.length !== 1) {
    throw new Error(
      `[eval] Erwartet genau „Magical Discoveries", geladen: ${features.length} ` +
        '(vault/classes/college-of-lore.json, tests/support/tauriInvokeShim.ts)',
    );
  }

  const ctx: FeatureEffectsContext = { classContext: bardClassContext, features };

  return [
    {
      label: 'Call 1 — Analyse: die Zauber-Wahl muss entstehen (2 Zauber, Grad 0–3, eine Liste)',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'analysis',
        analysis: await analyzeFeatureEffects(cfg, ctx, { noRetry: true }),
      }),
      core: analyzeCore,
      soft: analyzeSoft,
    },
    {
      label: 'Call C — Finalisierung mit offener Wahl: kein geratener Zauber',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => {
        const analysis = await analyzeFeatureEffects(cfg, ctx, { noRetry: true });
        return { kind: 'effects', effects: await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true }) };
      },
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}

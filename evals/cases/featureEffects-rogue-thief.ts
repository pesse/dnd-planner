/**
 * Eval-Case: featureEffects für Schurke 2→3 / Dieb — die Gegenprobe zum Druiden.
 *
 * Der Druiden-Fall misst, ob die KI eine Wahl ERKENNT und danach die richtigen Zauber
 * gewährt. Dieser Fall misst das Gegenteil: ein Aufstieg ohne jede erzwungene Wahl und
 * ohne Zauber. Gemessen wird also vor allem, was NICHT passieren darf —
 *   Call 1: keine Choices (insbesondere keine erneute Unterklassen-Frage), keine Zauber,
 *           nicht blockiert.
 *   Call C: keine erfundenen Grants (Zauber, Expertise, Attributsboni) und keine
 *           protokollierten Entscheidungen, denn es wurde keine getroffen.
 *
 * Für die Bogen-Notizen (`sheetNote`) ist derselbe Fall die POSITIVprobe: Ruhiges Zielen,
 * Flinke Hände und Einbrucharbeit tragen zwar keinen im Rider-Schema abbildbaren Grant,
 * sind aber genau die aktiv einzusetzenden Fähigkeiten, die auf dem Charakterbogen eine
 * Zeile verdienen — hier muss die KI also schreiben, nicht schweigen.
 *
 * Die Merkmale kommen wie beim Druiden über den echten Ladepfad (siehe Fixture); der
 * Wahl-Zeiger „Rogue Subclass" ist dort bereits deterministisch herausgefiltert.
 */
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type FeatureEffectsContext,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import { ABILITY_KEYS } from '../../src/lib/services/levelUpMachine';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { asAnalysis, asEffects, isSheetReady, sheetNotes, SHEET_NOTE_LIMIT, type StepResult } from './featureEffectsStep';
import {
  EXPECTED_FEATURE_NAMES,
  EXPECTED_FEATURE_NAMES_DE,
  FILTERED_FEATURE_NAME,
  loadRogueThiefFeatures,
  rogueClassContext,
} from '../fixtures/rogue-l3-thief';

const subclassRe = /unterklasse|subklasse|subclass/i;

// ── Call 1: Analyse (nichts zu entscheiden) ──────────────────────────────────────

const analyzeCore: Checks<StepResult> = {
  'erkennt keine erzwungene Wahl': (r) => asAnalysis(r)?.choices.length === 0,
  'nicht blockiert': (r) => asAnalysis(r)?.blocked === false,
  'keine zu erdenden Zauber (Schurke wirkt keine)': (r) => asAnalysis(r)?.spellsToGround.length === 0,
};

const analyzeSoft: Checks<StepResult> = {
  // Diagnose: die Subklasse ist am eigenen Checkpoint längst gewählt und steht als
  // `subclassName` im Klassen-Kontext — sie darf nie erneut erfragt werden.
  'fragt die Unterklasse nicht erneut ab': (r) => {
    const a = asAnalysis(r);
    return !!a && !a.choices.some((c) => subclassRe.test([c.question, c.feature, ...c.options].join(' ')));
  },
};

// ── Call C: Finalisierung (nichts aufzulösen) ────────────────────────────────────

const finalizeCore: Checks<StepResult> = {
  'gewährt keine Zauber': (r) =>
    asEffects(r)?.riders.every((x) => x.grantedSpells.length === 0 && x.extraCantrips === 0 && x.extraPreparedCount === 0) ??
    false,
  'erfindet keine Expertise': (r) => asEffects(r)?.riders.every((x) => x.expertiseSkills.length === 0) ?? false,
  'erfindet keine Attributsboni': (r) =>
    asEffects(r)?.riders.every((x) => ABILITY_KEYS.every((k) => (x.abilityScoreIncrease[k] ?? 0) === 0)) ?? false,
  'protokolliert keine Entscheidung (es wurde keine getroffen)': (r) =>
    asEffects(r)?.riders.every((x) => x.decisions.length === 0) ?? false,
  'Rider nur zu tatsächlich gewonnenen Merkmalen': (r) =>
    asEffects(r)?.riders.every((x) =>
      EXPECTED_FEATURE_NAMES.some((n) => x.featureName.toLowerCase().includes(n.toLowerCase())),
    ) ?? false,
  // Seit Pass-C-Regel 1 gibt es genau einen Rider je Merkmal — auch für Merkmale ohne
  // schema-abbildbaren Grant, die dann nur ihre Bogen-Notiz tragen.
  'ein Rider je gewonnenem Merkmal': (r) => asEffects(r)?.riders.length === EXPECTED_FEATURE_NAMES.length,
  // Die drei Merkmale sind aktiv einzusetzende Fähigkeiten mit konkreter Mechanik und
  // stehen auf dem Bogen sonst nirgends — jedes verdient also eine Zeile.
  'jedes Merkmal trägt eine Bogen-Notiz': (r) =>
    asEffects(r)?.riders.every((x) => x.sheetNote.trim().length > 0) ?? false,
};

const finalizeSoft: Checks<StepResult> = {
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  // Die Notiz soll als Gedächtnisstütze taugen — ohne den Merkmalsnamen ist sie auf dem
  // Bogen nicht zuzuordnen.
  'jede Bogen-Notiz nennt ihr Merkmal': (r) =>
    asEffects(r)?.riders.every((x) => !x.sheetNote.trim() || nameMentioned(x.sheetNote)) ?? false,
};

/** Trägt die Notiz einen der erwarteten Merkmalsnamen (EN oder deutsche Entsprechung)? */
function nameMentioned(note: string): boolean {
  const n = note.toLowerCase();
  return EXPECTED_FEATURE_NAMES.some((name) => n.includes(name.toLowerCase()))
    || EXPECTED_FEATURE_NAMES_DE.some((name) => n.includes(name.toLowerCase()));
}

export async function buildRogueThiefCases(): Promise<EvalCase<StepResult>[]> {
  const features = await loadRogueThiefFeatures();
  if (features.length === 0) {
    throw new Error(
      '[eval] Keine Merkmale geladen — Vault-Shim aktiv? ' +
        '(vault/classes/rogue.json + thief.json, evals/setup/tauriInvokeShim.ts)',
    );
  }
  if (features.some((f) => f.name === FILTERED_FEATURE_NAME)) {
    throw new Error(
      `[eval] „${FILTERED_FEATURE_NAME}" steckt noch im KI-Input — der Wahl-Zeiger-Filter ` +
        'in gainedFeaturesFor greift nicht mehr (src/lib/services/levelUp.ts: isFlowOwnedChoiceFeature).',
    );
  }

  const ctx: FeatureEffectsContext = { classContext: rogueClassContext, features };

  return [
    {
      label: 'Call 1 — Analyse: keine Wahl, keine Zauber',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'analysis',
        analysis: await analyzeFeatureEffects(cfg, ctx, { noRetry: true }),
      }),
      core: analyzeCore,
      soft: analyzeSoft,
    },
    {
      label: 'Call C — Finalisierung ohne offene Wahl',
      input: JSON.stringify(ctx),
      // Kette wie in der App: erst analysieren, dann finalisieren. Ohne erkannte Wahl
      // überspringt der Flow den Choice-Checkpoint, `resolvedChoices` bleibt leer.
      run: async (cfg: LlmConfig): Promise<StepResult> => {
        const analysis: FeatureAnalysis = await analyzeFeatureEffects(cfg, ctx, { noRetry: true });
        return { kind: 'effects', effects: await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true }) };
      },
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}

/**
 * Eval-Case: featureEffects für Druide 2→3 / Zirkel des Landes.
 *
 * Spiegelt den ZWEI-Phasen-Flow der echten Maschine:
 *   Call 1 (analyzeFeatureEffects) — erwartet GENAU EINE Landart-Wahl mit
 *          determinesFurtherEffects=true, ≥3 Optionen und (noch) keine Zauber.
 *   Call C (finalizeFeatureEffects, mit aufgelöster Landart) — erwartet konkrete
 *          Kreissprüche als grantedSpells und die Landart als getroffene Entscheidung
 *          (rider.decisions).
 *
 * Beide Fälle rufen den Produktionspfad über `run` selbst auf (mehrere verkettete
 * Calls), statt eine einzelne Action zu messen.
 */
import type { FeatureEffects } from '../../src/lib/schemas/levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type FeatureEffectsContext,
} from '../../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import {
  druidClassContext,
  loadCircleOfLandFeatures,
  EXPECTED_LAND_TYPES,
  EXPECTED_CIRCLE_SPELLS,
  RESOLVED_LAND,
} from '../fixtures/druid-l3-circle-of-land';

/** Ergebnis eines Falls: Call 1 liefert die Analyse, Call C die Rider. */
export type StepResult =
  | { kind: 'analysis'; analysis: FeatureAnalysis }
  | { kind: 'effects'; effects: FeatureEffects };

const asAnalysis = (r: StepResult): FeatureAnalysis | null => (r.kind === 'analysis' ? r.analysis : null);
const asEffects = (r: StepResult): FeatureEffects | null => (r.kind === 'effects' ? r.effects : null);

const landRe = /land|gelände|terrain/i;

/** Landart-Wahlen aus der Analyse (Frage/Optionen referenzieren „Land/Gelände/Terrain"). */
function landChoices(a: FeatureAnalysis) {
  return a.choices.filter((c) => landRe.test([c.question, ...c.options].join(' ')));
}

function grantedSpellsLower(fe: FeatureEffects): Set<string> {
  return new Set(fe.riders.flatMap((r) => r.grantedSpells).map((s) => s.toLowerCase().trim()));
}

// ── Call 1: Analyse (ohne aufgelöste Wahl) ───────────────────────────────────────

const analyzeCore: Checks<StepResult> = {
  'liefert mindestens eine Wahl': (r) => (asAnalysis(r)?.choices.length ?? 0) > 0,
  'genau EINE folgenreiche Landart-Wahl': (r) => {
    const a = asAnalysis(r);
    return !!a && landChoices(a).filter((c) => c.determinesFurtherEffects).length === 1;
  },
  'Landart-Wahl hat ≥3 Optionen': (r) => {
    const a = asAnalysis(r);
    return !!a && (landChoices(a)[0]?.options.length ?? 0) >= 3;
  },
  'noch keine zu erdenden Zauber vor der Wahl': (r) => {
    const a = asAnalysis(r);
    return !!a && (a.blocked || a.spellsToGround.length === 0);
  },
};

const analyzeSoft: Checks<StepResult> = {
  'Optionen decken erwartete Landarten ab': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    const opts = (landChoices(a)[0]?.options ?? []).map((o) => o.toLowerCase());
    const hits = EXPECTED_LAND_TYPES.filter((exp) => opts.some((o) => o.includes(exp.toLowerCase())));
    return hits.length >= 2;
  },
};

// ── Call C: Finalisierung (Landart aufgelöst) ────────────────────────────────────

const finalizeCore: Checks<StepResult> = {
  'gewährt Kreissprüche (grantedSpells nicht leer)': (r) =>
    asEffects(r)?.riders.some((x) => x.grantedSpells.length > 0) ?? false,
  'hält die Landart als getroffene Entscheidung fest (rider.decisions)': (r) =>
    asEffects(r)?.riders.some((x) => x.decisions.some((d) => landRe.test(`${d.question} ${d.answer}`))) ?? false,
};

/** Nur prüfbar, wenn eine Referenzliste hinterlegt ist (sonst zählt nur „überhaupt Sprüche"). */
const finalizeSoft: Checks<StepResult> = EXPECTED_CIRCLE_SPELLS.length
  ? {
      'gewährte Kreissprüche enthalten die Referenzliste': (r) => {
        const fe = asEffects(r);
        if (!fe) return false;
        const got = grantedSpellsLower(fe);
        return EXPECTED_CIRCLE_SPELLS.every((s) => got.has(s.toLowerCase().trim()));
      },
    }
  : {};

export async function buildDruidCircleCases(): Promise<EvalCase<StepResult>[]> {
  // Merkmale über den ECHTEN Ladepfad (Vault) beziehen — kein handgeschriebener Input.
  const features = await loadCircleOfLandFeatures();
  if (features.length === 0) {
    throw new Error(
      '[eval] Keine Subklassen-Merkmale geladen — Vault-Shim aktiv? ' +
        '(vault/classes/circle-of-the-land.json, evals/setup/tauriInvokeShim.ts)',
    );
  }

  const pass1Ctx: FeatureEffectsContext = { classContext: druidClassContext, features };
  const pass2Ctx: FeatureEffectsContext = {
    classContext: druidClassContext,
    features,
    resolvedChoices: [
      { feature: 'Circle of the Land Spells', prompt: 'Wähle deine Landart', choice: RESOLVED_LAND },
    ],
  };
  // Bei gesetzten resolvedChoices reasoniert finalize neu → die übergebene Analyse ist nur
  // Fallback und darf leer sein (kein separater Call-1 nötig für den Finalisierungs-Test).
  const emptyAnalysis: FeatureAnalysis = { choices: [], spellsToGround: [], blocked: false, analysisText: '' };

  return [
    {
      label: 'Call 1 — Analyse: Landart-Wahl erwartet',
      input: JSON.stringify(pass1Ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'analysis',
        analysis: await analyzeFeatureEffects(cfg, pass1Ctx, { noRetry: true }),
      }),
      core: analyzeCore,
      soft: analyzeSoft,
    },
    {
      label: `Call C — Landart "${RESOLVED_LAND}" aufgelöst`,
      input: JSON.stringify(pass2Ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'effects',
        effects: await finalizeFeatureEffects(cfg, pass2Ctx, emptyAnalysis, { noRetry: true }),
      }),
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}

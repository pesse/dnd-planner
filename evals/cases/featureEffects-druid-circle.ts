/**
 * Eval-Case: featureEffects für Druide 2→3 / Zirkel des Landes.
 *
 * Spiegelt den ZWEI-Phasen-Flow der echten Maschine:
 *   Call 1 (analyzeFeatureEffects) — erwartet GENAU EINE Landart-Wahl mit
 *          determinesFurtherEffects=true, ≥3 Optionen und (noch) keine Zauber.
 *   Call C (finalizeFeatureEffects, mit aufgelöster Landart) — erwartet konkrete
 *          Kreissprüche als grantedSpells und die Landart als getroffene Entscheidung
 *          (rider.decisions). Weich zusätzlich die Bogen-Notiz: kurz, einzeilig, nennt
 *          die Landart — und listet die Kreissprüche gerade NICHT auf (die stehen schon
 *          in der Zauberliste).
 *
 * Beide Fälle rufen den Produktionspfad über `run` selbst auf (mehrere verkettete
 * Calls), statt eine einzelne Action zu messen. Der Call-C-Fall kettet bewusst über
 * eine echte Call-1-Analyse: die Wahl wird als Folge-Turn auf DEREN Verlauf nachgereicht
 * (nur {id, choice}), so wie die App es tut.
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
import { asAnalysis, asEffects, isSheetReady, sheetNotes, SHEET_NOTE_LIMIT, type StepResult } from './featureEffectsStep';
import {
  druidClassContext,
  loadCircleOfLandFeatures,
  EXPECTED_LAND_TYPES,
  EXPECTED_CIRCLE_SPELLS,
  EXPECTED_CIRCLE_SPELLS_DE,
  RESOLVED_LAND,
} from '../fixtures/druid-l3-circle-of-land';

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

/**
 * Weiche Prüfungen der Finalisierung. Neben der Zauber-Referenzliste messen sie die
 * Bogen-Notizen — und zwar vor allem das WEGLASSEN: die Kreissprüche stehen bereits in
 * der Zauberliste des Charakters, ihre Namen haben im knappen Klassenmerkmale-Feld
 * nichts verloren. Genau daran hängt die „nur bei Bedarf"-Heuristik von Regel 10.
 */
const finalizeSoft: Checks<StepResult> = {
  ...(EXPECTED_CIRCLE_SPELLS.length
    ? {
        'gewährte Kreissprüche enthalten die Referenzliste': (r: StepResult) => {
          const fe = asEffects(r);
          if (!fe) return false;
          const got = grantedSpellsLower(fe);
          return EXPECTED_CIRCLE_SPELLS.every((s) => got.has(s.toLowerCase().trim()));
        },
      }
    : {}),
  'liefert mindestens eine Bogen-Notiz': (r) => sheetNotes(r).length > 0,
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  'Bogen-Notiz nennt die gewählte Landart': (r) =>
    sheetNotes(r).some((n) => n.toLowerCase().includes(RESOLVED_LAND.toLowerCase())),
  // Die Notiz ist deutsch, die grantedSpells sind kanonisch englisch — geprüft wird
  // daher gegen beide Schreibweisen.
  'zählt die gewährten Kreissprüche NICHT in der Bogen-Notiz auf': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const notes = sheetNotes(r).join('\n').toLowerCase();
    const spellNames = [...grantedSpellsLower(fe), ...EXPECTED_CIRCLE_SPELLS_DE.map((s) => s.toLowerCase())];
    return !spellNames.some((s) => s && notes.includes(s));
  },
};

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
      input: JSON.stringify({ ...pass1Ctx, resolvedChoices: [{ id: '<aus Call 1>', choice: RESOLVED_LAND }] }),
      // Kette wie in der App: erst analysieren, dann die Wahl auf DIESE Analyse
      // nachreichen. Die Choice-id stammt daher aus dem Manifest von Call 1 —
      // eine erfundene id würde den Verlauf zerreißen.
      run: async (cfg: LlmConfig): Promise<StepResult> => {
        const analysis: FeatureAnalysis = await analyzeFeatureEffects(cfg, pass1Ctx, { noRetry: true });
        const landId = landChoices(analysis)[0]?.id ?? analysis.choices[0]?.id ?? '';
        const ctx: FeatureEffectsContext = {
          ...pass1Ctx,
          resolvedChoices: [{ id: landId, choice: RESOLVED_LAND }],
        };
        return { kind: 'effects', effects: await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true }) };
      },
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}

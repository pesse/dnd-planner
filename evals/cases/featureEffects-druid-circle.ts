/**
 * Eval-Case: featureEffects für Druide 2→3 / Zirkel des Landes.
 *
 * Der Merkmalstext ist auf sein Original zurückgeführt: „Whenever you finish a Long Rest,
 * choose one type of land …". Die Landart ist damit KEINE Aufstiegs-Entscheidung mehr,
 * sondern eine Wahl, die nach jeder langen Rast neu getroffen wird. Für den Aufstieg
 * heißt das:
 *   Call 1 (analyzeFeatureEffects) — KEINE Choice (insbesondere keine Landart-Frage),
 *          nicht blockiert, und KEIN geerdeter Zauber.
 *   Call C (finalizeFeatureEffects, ohne resolvedChoices) — kein gewährter Kreisspruch,
 *          keine protokollierte Entscheidung, dazu die Notiz-Qualität von „Land's Aid".
 *
 * Die zwölf Kreissprüche selbst sind seit 2026-07-29 KEINE KI-Aufgabe mehr: sie stehen als
 * Tabelle im Merkmalstext und werden deterministisch gelesen (`services/grantedSpells.ts`,
 * geprüft in `evals/grantedSpells.test.ts`). Das Merkmal fliegt daher vor der Deutung aus
 * dem Eingang, und diese Strecke ist für die Zauber jetzt eine NEGATIVprobe: was hier noch
 * an Kreissprüchen auftaucht, wäre geraten und stünde doppelt am Charakter.
 *
 * „Vorbereitet" bleibt bewusst außen vor: welche der vier Listen gerade gilt, entscheidet
 * die Rast am Tisch, nicht der Aufstieg. Der Aufstieg liefert nur die vollständige Liste.
 *
 * Beide Fälle rufen den Produktionspfad über `run` selbst auf (mehrere verkettete Calls),
 * statt eine einzelne Action zu messen.
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
  EXPECTED_CIRCLE_SPELLS,
  EXPECTED_CIRCLE_SPELLS_DE,
  TOO_HIGH_CIRCLE_SPELLS,
} from '../fixtures/druid-l3-circle-of-land';

const landRe = /land|gelände|terrain/i;

/** Landart-bezogene Wahlen aus der Analyse (Frage/Optionen referenzieren „Land/Gelände/Terrain"). */
function landChoices(a: FeatureAnalysis) {
  return a.choices.filter((c) => landRe.test([c.question, ...c.options].join(' ')));
}

const lower = (xs: string[]) => new Set(xs.map((s) => s.toLowerCase().trim()));

function grantedSpellsLower(fe: FeatureEffects): Set<string> {
  return lower(fe.riders.flatMap((r) => r.grantedSpells));
}

// ── Call 1: Analyse (es gibt nichts zu entscheiden) ──────────────────────────────

const analyzeCore: Checks<StepResult> = {
  // Kernaussage des Originaltexts: die Landart wird pro langer Rast gewählt. Beim
  // Aufstieg darf daher gar keine Frage entstehen — auch keine „unschädliche".
  'erkennt keine erzwungene Wahl': (r) => asAnalysis(r)?.choices.length === 0,
  'fragt insbesondere keine Landart ab': (r) => {
    const a = asAnalysis(r);
    return !!a && landChoices(a).length === 0;
  },
  'nicht blockiert (keine offene Wahl hält Zauber zurück)': (r) => asAnalysis(r)?.blocked === false,
  // Die Kreissprüche stehen als Tabelle im Merkmalstext und werden deterministisch gelesen
  // (`services/grantedSpells.ts`, geprüft in `evals/grantedSpells.test.ts`); das Merkmal ist
  // deshalb nicht mehr im Eingang. Was hier an Kreissprüchen auftaucht, wäre also aus dem
  // Kontext geraten — genau der Fehler, den das Modell vorher machen KONNTE.
  'erdet keinen Kreisspruch mehr (kommt deterministisch)': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    const got = lower(a.spellsToGround);
    return ![...EXPECTED_CIRCLE_SPELLS, ...TOO_HIGH_CIRCLE_SPELLS].some((s) => got.has(s.toLowerCase()));
  },
};

const analyzeSoft: Checks<StepResult> = {
  // „Land's Aid" ist das einzige verbleibende Merkmal der Stufe 3 — es wirkt „Cure Wounds"
  // über eine Wildgestalt-Nutzung, gewährt den Zauber aber NICHT dauerhaft.
  'erdet überhaupt keinen Zauber': (r) => asAnalysis(r)?.spellsToGround.length === 0,
};

// ── Call C: Finalisierung (nichts aufzulösen) ────────────────────────────────────

const finalizeCore: Checks<StepResult> = {
  // Gegenstück zur Analyse-Probe: auch die Finalisierung darf die deterministisch gewährten
  // Kreissprüche nicht ein zweites Mal erfinden — sonst stünden sie doppelt am Charakter.
  'gewährt keinen Kreisspruch mehr (kommt deterministisch)': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpellsLower(fe);
    return ![...EXPECTED_CIRCLE_SPELLS, ...TOO_HIGH_CIRCLE_SPELLS].some((s) => got.has(s.toLowerCase()));
  },
  // Es wurde keine Wahl getroffen (und keine gestellt) — also gibt es nichts zu protokollieren.
  'protokolliert keine Entscheidung (Landart fällt pro Rast)': (r) =>
    asEffects(r)?.riders.every((x) => x.decisions.length === 0) ?? false,
};

/**
 * Weiche Prüfungen der Finalisierung: die Bogen-Notiz des verbleibenden Merkmals
 * („Land's Aid" — Wildgestalt-Nutzung gegen einen Heilzauber). Sie muss knapp und einzeilig
 * sein und darf keinen Zaubernamen ausbuchstabieren, den die Zauberliste ohnehin führt.
 *
 * Die frühere Probe „Notiz nennt die Landart-Wahl pro langer Rast" ist hier WEG, nicht
 * aufgeweicht: das Kreisspruch-Merkmal steht nicht mehr im Eingang, also kann diese Kette
 * dazu auch keine Notiz mehr liefern. Der Hinweis entsteht jetzt im deutschen
 * Merkmalstext-Schritt (`fieldSummaryAction` aus `descDe`) — eine andere Strecke.
 */
const finalizeSoft: Checks<StepResult> = {
  'liefert mindestens eine Bogen-Notiz': (r) => sheetNotes(r).length > 0,
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  // Die Notiz ist deutsch, die Zaubernamen kanonisch englisch — geprüft gegen beide.
  'zählt keine Kreissprüche in der Bogen-Notiz auf': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const notes = sheetNotes(r).join('\n').toLowerCase();
    const spellNames = [...EXPECTED_CIRCLE_SPELLS, ...EXPECTED_CIRCLE_SPELLS_DE].map((s) => s.toLowerCase());
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

  const ctx: FeatureEffectsContext = { classContext: druidClassContext, features };

  return [
    {
      label: 'Call 1 — Analyse: keine Wahl, alle vier Landarten geerdet',
      input: JSON.stringify(ctx),
      run: async (cfg: LlmConfig): Promise<StepResult> => ({
        kind: 'analysis',
        analysis: await analyzeFeatureEffects(cfg, ctx, { noRetry: true }),
      }),
      core: analyzeCore,
      soft: analyzeSoft,
    },
    {
      label: 'Call C — Finalisierung ohne Wahl: zwölf Kreissprüche',
      input: JSON.stringify(ctx),
      // Kette wie in der App: erst analysieren, dann finalisieren. Erkennt Call 1 keine
      // Wahl, überspringt der Flow den Checkpoint — `resolvedChoices` bleibt leer.
      run: async (cfg: LlmConfig): Promise<StepResult> => {
        const analysis: FeatureAnalysis = await analyzeFeatureEffects(cfg, ctx, { noRetry: true });
        return { kind: 'effects', effects: await finalizeFeatureEffects(cfg, ctx, analysis, { noRetry: true }) };
      },
      core: finalizeCore,
      soft: finalizeSoft,
    },
  ];
}

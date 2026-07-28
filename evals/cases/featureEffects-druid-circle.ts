/**
 * Eval-Case: featureEffects für Druide 2→3 / Zirkel des Landes.
 *
 * Der Merkmalstext ist auf sein Original zurückgeführt: „Whenever you finish a Long Rest,
 * choose one type of land …". Die Landart ist damit KEINE Aufstiegs-Entscheidung mehr,
 * sondern eine Wahl, die nach jeder langen Rast neu getroffen wird. Für den Aufstieg
 * heißt das:
 *   Call 1 (analyzeFeatureEffects) — KEINE Choice (insbesondere keine Landart-Frage),
 *          nicht blockiert; stattdessen die Stufe-3-Zeile ALLER VIER Landarten als
 *          zu erdende Zauber.
 *   Call C (finalizeFeatureEffects, ohne resolvedChoices) — dieselben zwölf Kreissprüche
 *          als grantedSpells und KEINE protokollierte Entscheidung. Weich zusätzlich die
 *          Bogen-Notiz: kurz, einzeilig, erinnert an die Landart-Wahl pro langer Rast —
 *          und listet die Kreissprüche gerade NICHT auf (die stehen in der Zauberliste).
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
  LAND_TYPES_DE,
  EXPECTED_CIRCLE_SPELLS,
  EXPECTED_CIRCLE_SPELLS_DE,
  TOO_HIGH_CIRCLE_SPELLS,
} from '../fixtures/druid-l3-circle-of-land';

const landRe = /land|gelände|terrain/i;
/** Verweis auf die (lange) Rast — die Notiz soll den Wahl-Zeitpunkt nennen. */
const restRe = /rast/i;

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
  'erdet die Stufe-3-Kreissprüche ALLER vier Landarten': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    const got = lower(a.spellsToGround);
    return EXPECTED_CIRCLE_SPELLS.every((s) => got.has(s.toLowerCase()));
  },
};

const analyzeSoft: Checks<StepResult> = {
  // „for your Druid level and lower" — die Zeilen 5/7/9 gehören auf Stufe 3 nicht dazu.
  'erdet keine Kreissprüche höherer Stufen': (r) => {
    const a = asAnalysis(r);
    if (!a) return false;
    const got = lower(a.spellsToGround);
    return !TOO_HIGH_CIRCLE_SPELLS.some((s) => got.has(s.toLowerCase()));
  },
  'erdet nicht mehr als die zwölf Kreissprüche': (r) =>
    (asAnalysis(r)?.spellsToGround.length ?? 99) <= EXPECTED_CIRCLE_SPELLS.length,
};

// ── Call C: Finalisierung (nichts aufzulösen) ────────────────────────────────────

const finalizeCore: Checks<StepResult> = {
  'gewährt die Stufe-3-Kreissprüche ALLER vier Landarten': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpellsLower(fe);
    return EXPECTED_CIRCLE_SPELLS.every((s) => got.has(s.toLowerCase()));
  },
  // Es wurde keine Wahl getroffen (und keine gestellt) — also gibt es nichts zu protokollieren.
  'protokolliert keine Entscheidung (Landart fällt pro Rast)': (r) =>
    asEffects(r)?.riders.every((x) => x.decisions.length === 0) ?? false,
};

/**
 * Weiche Prüfungen der Finalisierung. Neben der Zauber-Referenzliste messen sie die
 * Bogen-Notizen — und zwar vor allem das WEGLASSEN: die Kreissprüche stehen bereits in
 * der Zauberliste des Charakters, ihre Namen haben im knappen Klassenmerkmale-Feld
 * nichts verloren. Genau daran hängt die „nur bei Bedarf"-Heuristik von Regel 10.
 * Was die Notiz dafür leisten SOLL: an den Wahl-Zeitpunkt erinnern (lange Rast).
 */
const finalizeSoft: Checks<StepResult> = {
  'gewährt keine Kreissprüche höherer Stufen': (r) => {
    const fe = asEffects(r);
    if (!fe) return false;
    const got = grantedSpellsLower(fe);
    return !TOO_HIGH_CIRCLE_SPELLS.some((s) => got.has(s.toLowerCase()));
  },
  'gewährt nicht mehr als die zwölf Kreissprüche': (r) => {
    const fe = asEffects(r);
    return !!fe && grantedSpellsLower(fe).size <= EXPECTED_CIRCLE_SPELLS.length;
  },
  'liefert mindestens eine Bogen-Notiz': (r) => sheetNotes(r).length > 0,
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  'Bogen-Notiz nennt die Landart-Wahl pro (langer) Rast': (r) =>
    sheetNotes(r).some((n) => restRe.test(n) && (landRe.test(n) || LAND_TYPES_DE.some((t) => n.toLowerCase().includes(t)))),
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

/**
 * Eval-Case: Bogen-Notizen für Druide 2→3 / Zirkel des Landes.
 *
 * Der Fall lebt von einer Eigenheit des Merkmalstexts: „Land's Aid" trägt eine
 * Wachstumsklausel („The damage and healing increase by 1d6 … at Druid levels 10 and 14"),
 * die auf dem Bogen nichts nützt — die Notiz soll die Mechanik der AKTUELLEN Stufe
 * festhalten. Dazu die Negativprobe der Zauberliste: die zwölf Kreissprüche stehen
 * deterministisch im Zauberblock, in der Notiz wären sie die Dublette, die das Budget frisst.
 */
import { summarizeFeatureNotes } from '../../src/lib/services/aiActions/featureNotesAction';
import type { FeatureNote } from '../../src/lib/schemas/levelUp';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { isSheetReady, sheetNotes, SHEET_NOTE_LIMIT } from './featureNotesStep';
import {
  druidClassContext,
  loadCircleOfLandFeatures,
  EXPECTED_CIRCLE_SPELLS,
  EXPECTED_CIRCLE_SPELLS_DE,
} from '../../tests/fixtures/druid-l3-circle-of-land';

const core: Checks<FeatureNote[]> = {
  'liefert mindestens eine Bogen-Notiz': (r) => sheetNotes(r).length > 0,
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
  // Die Notiz ist deutsch, die Zaubernamen kanonisch englisch — geprüft gegen beide.
  'zählt keine Kreissprüche in der Bogen-Notiz auf': (r) => {
    const notes = sheetNotes(r).join('\n').toLowerCase();
    return ![...EXPECTED_CIRCLE_SPELLS, ...EXPECTED_CIRCLE_SPELLS_DE]
      .map((s) => s.toLowerCase())
      .some((s) => s && notes.includes(s));
  },
};

const soft: Checks<FeatureNote[]> = {
  // „Land's Aid" wirkt über eine Tiergestalt-Nutzung — ohne diese Kosten ist die Notiz als
  // Gedächtnisstütze wertlos.
  'nennt die Tiergestalt-Kosten von „Land\'s Aid"': (r) =>
    /tiergestalt|wild shape/i.test(sheetNotes(r).join('\n')),
  // Wachstumsklauseln („ab Stufe 10 …") sind auf dem Bogen toter Text: die Notiz gilt der
  // Mechanik der aktuellen Stufe.
  'lässt die Wachstumsklausel weg': (r) =>
    !/stufe (?:10|14)|level (?:10|14)|3w6|4w6|3d6|4d6/i.test(sheetNotes(r).join('\n')),
};

export async function buildDruidNoteCases(): Promise<EvalCase<FeatureNote[]>[]> {
  // Merkmale über den ECHTEN Ladepfad (Vault) beziehen — kein handgeschriebener Input.
  const features = await loadCircleOfLandFeatures();
  if (features.length === 0) {
    throw new Error(
      '[eval] Keine Subklassen-Merkmale geladen — Vault-Shim aktiv? '
        + '(vault/classes/circle-of-the-land.json, tests/support/tauriInvokeShim.ts)',
    );
  }
  const ctx = { classContext: druidClassContext, features };
  return [
    {
      label: 'Notiz-Pass — Mechanik der aktuellen Stufe, keine Zauberliste',
      input: JSON.stringify(ctx),
      run: (cfg: LlmConfig): Promise<FeatureNote[]> => summarizeFeatureNotes(cfg, ctx, { noRetry: true }),
      core,
      soft,
    },
  ];
}

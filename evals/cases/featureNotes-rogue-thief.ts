/**
 * Eval-Case: Bogen-Notizen für Schurke 2→3 / Dieb — die Positivprobe.
 *
 * Ruhiges Zielen, Flinke Hände und Einbrucharbeit tragen keinen deklarierbaren Grant, sind
 * aber genau die aktiv einzusetzenden Fähigkeiten, die auf dem Bogen sonst nirgends stehen.
 * Hier muss die KI also SCHREIBEN, nicht schweigen — und zu jedem Merkmal genau eine Zeile.
 */
import { summarizeFeatureNotes } from '../../src/lib/services/aiActions/featureNotesAction';
import type { FeatureNote } from '../../src/lib/schemas/levelUp';
import type { LlmConfig } from '../../src/lib/types';
import type { Checks, EvalCase } from '../defineEval';
import { isSheetReady, sheetNotes, SHEET_NOTE_LIMIT } from './featureNotesStep';
import {
  EXPECTED_FEATURE_NAMES,
  EXPECTED_FEATURE_NAMES_DE,
  FILTERED_FEATURE_NAME,
  loadRogueThiefFeatures,
  rogueClassContext,
} from '../../tests/fixtures/rogue-l3-thief';

/** Trägt die Notiz einen der erwarteten Merkmalsnamen (EN oder deutsche Entsprechung)? */
function nameMentioned(note: string): boolean {
  const n = note.toLowerCase();
  return [...EXPECTED_FEATURE_NAMES, ...EXPECTED_FEATURE_NAMES_DE].some((name) => n.includes(name.toLowerCase()));
}

const core: Checks<FeatureNote[]> = {
  'eine Notiz je gewonnenem Merkmal': (r) => sheetNotes(r).length === EXPECTED_FEATURE_NAMES.length,
  'Notizen nur zu tatsächlich gewonnenen Merkmalen': (r) =>
    r.every((n) => EXPECTED_FEATURE_NAMES.some((x) => n.featureName.toLowerCase().includes(x.toLowerCase()))),
  [`Bogen-Notizen sind einzeilig und ≤ ${SHEET_NOTE_LIMIT} Zeichen`]: (r) => {
    const notes = sheetNotes(r);
    return notes.length > 0 && notes.every(isSheetReady);
  },
};

const soft: Checks<FeatureNote[]> = {
  // Ohne den Merkmalsnamen ist die Zeile auf dem Bogen nicht zuzuordnen.
  'jede Bogen-Notiz nennt ihr Merkmal': (r) => sheetNotes(r).every(nameMentioned),
};

export async function buildRogueNoteCases(): Promise<EvalCase<FeatureNote[]>[]> {
  const features = await loadRogueThiefFeatures();
  if (features.length === 0) {
    throw new Error(
      '[eval] Keine Merkmale geladen — Vault-Shim aktiv? '
        + '(vault/classes/rogue.json + thief.json, tests/support/tauriInvokeShim.ts)',
    );
  }
  if (features.some((f) => f.name === FILTERED_FEATURE_NAME)) {
    throw new Error(
      `[eval] „${FILTERED_FEATURE_NAME}" steckt noch im KI-Input — der Wahl-Zeiger-Filter `
        + 'in gainedFeaturesFor greift nicht mehr (src/lib/services/levelUp.ts: isFlowOwnedChoiceFeature).',
    );
  }
  const ctx = { classContext: rogueClassContext, features };
  return [
    {
      label: 'Notiz-Pass — je Merkmal eine Zeile, keine erfundene Mechanik',
      input: JSON.stringify(ctx),
      run: (cfg: LlmConfig): Promise<FeatureNote[]> => summarizeFeatureNotes(cfg, ctx, { noRetry: true }),
      core,
      soft,
    },
  ];
}

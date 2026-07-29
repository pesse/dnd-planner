/**
 * Nagelt den Reasoning-Runaway-Pfad der Merkmals-Analyse fest.
 *
 * Der Runaway (Modell verbraucht sein Budget im Denk-Vorlauf, `content` bleibt leer) traf in
 * der Messung vom 2026-07-29 rund einen von fünf Läufen und kostete jedes Mal die ganze Kette.
 * Er ist stochastisch, lässt sich also nicht abwarten — deshalb wird er hier ERZWUNGEN:
 * mit einem absichtlich winzigen `maxTokens` läuft jeder Versuch ins Budget.
 *
 * Das ist der eine Ort, an dem ein kleines Token-Budget richtig ist: gemessen wird nicht
 * Qualität, sondern das Verhalten im Ausfall. Zwei Zusicherungen:
 *   1. `noRetry` (Eval-Pfad) → ein Versuch, sofortiger Fehler.
 *   2. ohne `noRetry` (App-Pfad) → zweiter Versuch, erst danach Fehler; die Meldung nennt
 *      den Reasoning-Vorlauf und nicht mehr ein zu kleines Budget.
 *
 * Kosten: vier winzige Calls (~300 Ausgabe-Tokens). Ohne QM_API_KEY/EVAL_MODEL übersprungen.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFeatureEffects, type FeatureEffectsContext } from '../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../src/lib/types';

const hasKeys = !!process.env.QM_API_KEY && !!process.env.EVAL_MODEL;

/** Budget so knapp, dass der Denk-Vorlauf es garantiert allein verbraucht. */
const STARVED_MAX_TOKENS = 300;

const config = (): LlmConfig =>
  ({
    provider: 'qualityminds',
    apiKey: process.env.QM_API_KEY ?? '',
    model: process.env.EVAL_MODEL ?? '',
    maxTokens: STARVED_MAX_TOKENS,
  }) as LlmConfig;

const ctx = (): FeatureEffectsContext => ({
  classContext: {
    klasseName: 'Druide',
    subclassName: 'Zirkel des Landes',
    casterType: 'FULL',
    casterKind: 'prepared',
    spellcastingAbility: 'wei',
    toLevel: 3,
  },
  features: [
    {
      name: 'Circle Spells',
      nameDe: 'Kreissprüche',
      desc: 'You gain access to circle spells that depend on the land type you choose.',
      source: 'subclass',
      gainedAt: 3,
      key: 'srd-2024_circle-of-the-land_circle-spells',
    },
  ],
  pastChoices: [],
});

describe.skipIf(!hasKeys)('Reasoning-Runaway der Merkmals-Analyse', () => {
  it('meldet den Ausfall mit der Ursache statt „Budget zu klein"', async () => {
    const err = await analyzeFeatureEffects(config(), ctx(), { noRetry: true }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/Reasoning-Vorlauf/);
  }, 120_000);

  it('versucht es ohne noRetry ein zweites Mal und hält das Lebenszeichen am Leben', async () => {
    let activity = 0;
    const err = await analyzeFeatureEffects(config(), ctx(), { onActivity: () => activity++ }).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/zweimal leer/);
    // Der Denk-Kanal muss gefeuert haben — sonst sähe die Oberfläche minutenlang nichts.
    expect(activity).toBeGreaterThan(0);
  }, 240_000);
});

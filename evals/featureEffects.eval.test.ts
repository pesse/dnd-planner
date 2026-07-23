/**
 * Eval: Prompt-Qualität von featureEffectsAction (Druide 2→3, Zirkel des Landes).
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval
 *
 * Optional: EVAL_RUNS (Default 5), EVAL_THRESHOLD (Default 0.9).
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { buildFeatureEffectsAction } from '../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../src/lib/types';
import { runStep, compareVariants, printStepReport, printComparison, coreAssertions } from './harness';
import { buildDruidCircleSteps } from './cases/featureEffects-druid-circle';
import { FEATURE_EFFECTS_BASELINE, FEATURE_EFFECTS_CANDIDATE } from './prompts/featureEffects';

const QM_API_KEY = process.env.QM_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL;
const RUNS = Number(process.env.EVAL_RUNS ?? '5');
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? '0.9');

const enabled = !!QM_API_KEY && !!EVAL_MODEL;
if (!enabled) {
  console.warn('[eval] übersprungen — setze QM_API_KEY und EVAL_MODEL, um die Evals zu laufen.');
}

describe.skipIf(!enabled)('featureEffects — Druide 2→3, Zirkel des Landes', () => {
  const action = buildFeatureEffectsAction();
  const steps = buildDruidCircleSteps();
  let config: LlmConfig;

  beforeAll(() => {
    config = { provider: 'qualityminds', model: EVAL_MODEL!, apiKey: QM_API_KEY!, maxTokens: 4096 };
    console.log(`\n[eval] model=${EVAL_MODEL}, runs=${RUNS}, threshold=${Math.round(THRESHOLD * 100)}%`);
  });

  it(`baseline-Prompt erreicht ≥${Math.round(THRESHOLD * 100)}% auf allen Core-Assertions`, async () => {
    for (const step of steps) {
      const report = await runStep(config, action, step, RUNS);
      printStepReport(report);
      for (const a of coreAssertions(report)) {
        expect(a.passRate, `${step.label} › ${a.label}`).toBeGreaterThanOrEqual(THRESHOLD);
      }
    }
  });

  it('vergleicht baseline vs. candidate (informativ)', async () => {
    const byVariant = await compareVariants(
      config,
      action,
      [
        { label: 'baseline', systemPrompt: FEATURE_EFFECTS_BASELINE },
        { label: 'candidate', systemPrompt: FEATURE_EFFECTS_CANDIDATE },
      ],
      steps,
      RUNS,
    );
    printComparison(byVariant, steps);
    expect(byVariant.size).toBe(2);
  });
});

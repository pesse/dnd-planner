/**
 * Eval: Prompt-Qualität von featureEffectsAction (Druide 2→3, Zirkel des Landes).
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval   (oder via .env)
 *
 * Es wird immer GENAU EIN Prompt ausgewertet (EVAL_PROMPT, Default "baseline").
 * Um Prompts zu VERGLEICHEN, läuft man die Eval mehrmals mit unterschiedlichem
 * EVAL_PROMPT/EVAL_TITLE — jeder Lauf schreibt einen eigenen Report nach
 * evals/reports/<timestamp>-<titel>/ (summary.md, summary.json, report.html,
 * runs.jsonl mit echten Requests/Responses). Die Reports legt man extern nebeneinander.
 *
 * Optional: EVAL_RUNS (Default 5 — bei langsamen Modellen 2–3), EVAL_THRESHOLD
 *           (Default 0.9), EVAL_CONCURRENCY (Default 4), EVAL_TITLE, EVAL_DESC.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { buildFeatureEffectsAction } from '../src/lib/services/aiActions/featureEffectsAction';
import type { LlmConfig } from '../src/lib/types';
import { runEval, withSystemPrompt, printStepReport, coreAssertions } from './harness';
import type { StepReport } from './harness';
import { installCapture, writeEvalReport, type EvalReport } from './report';
import { buildDruidCircleSteps } from './cases/featureEffects-druid-circle';
import { resolveFeatureEffectsPrompt } from './prompts/featureEffects';

const QM_API_KEY = process.env.QM_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL;
const RUNS = Number(process.env.EVAL_RUNS ?? '5');
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? '0.9');
// Nur die Runs je Step laufen parallel (Steps bleiben sequenziell).
// EVAL_CONCURRENCY=1 → sequenziell, für saubere Einzel-Latenz.
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? '4');
// Welcher Prompt getestet wird + optionaler Titel/Beschreibung für den Report.
const prompt = resolveFeatureEffectsPrompt(process.env.EVAL_PROMPT);
const TITLE = process.env.EVAL_TITLE ?? prompt.name;
const DESC = process.env.EVAL_DESC;

const enabled = !!QM_API_KEY && !!EVAL_MODEL;
if (!enabled) {
  console.warn('[eval] übersprungen — setze QM_API_KEY und EVAL_MODEL (oder eine .env), um die Evals zu laufen.');
}

describe.skipIf(!enabled)('featureEffects — Druide 2→3, Zirkel des Landes', () => {
  const action = withSystemPrompt(buildFeatureEffectsAction(), prompt.systemPrompt);
  const steps = buildDruidCircleSteps();
  const generatedAt = new Date().toISOString();
  let config: LlmConfig;
  let uninstallCapture: () => void;

  const persist = (stepReports: StepReport[]): string => {
    const report: EvalReport = {
      generatedAt,
      model: EVAL_MODEL!,
      provider: 'qualityminds',
      title: TITLE,
      description: DESC,
      runsPerStep: RUNS,
      threshold: THRESHOLD,
      concurrency: CONCURRENCY,
      steps: stepReports,
    };
    return writeEvalReport(report);
  };

  beforeAll(() => {
    config = { provider: 'qualityminds', model: EVAL_MODEL!, apiKey: QM_API_KEY!, maxTokens: 4096 };
    uninstallCapture = installCapture();
    console.log(
      `\n[eval] prompt=${prompt.name}, model=${EVAL_MODEL}, runs=${RUNS}, ` +
        `concurrency=${CONCURRENCY}, threshold=${Math.round(THRESHOLD * 100)}%`,
    );
  });

  afterAll(() => uninstallCapture?.());

  it(`Prompt "${TITLE}" erreicht den Schwellwert auf allen Core-Assertions`, async () => {
    let dir = '';
    const reports = await runEval(
      config,
      action,
      steps,
      RUNS,
      CONCURRENCY,
      // Inkrementell nach jedem Step: Report schreiben + Zwischenstand loggen.
      (partial, justFinished) => {
        printStepReport(justFinished);
        dir = persist(partial);
      },
    );

    dir = persist(reports);
    console.log(`\n[eval] Report geschrieben nach:\n  ${dir}\n  → report.html im Browser öffnen`);

    // Qualitäts-Gate: jede Core-Assertion muss den Schwellwert halten.
    for (const report of reports) {
      for (const a of coreAssertions(report)) {
        expect(a.passRate, `${report.step} › ${a.label}`).toBeGreaterThanOrEqual(THRESHOLD);
      }
    }
  });
});

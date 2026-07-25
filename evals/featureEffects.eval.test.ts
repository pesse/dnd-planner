/**
 * Eval: Prompt-Qualität von featureEffectsAction (Druide 2→3, Zirkel des Landes).
 *
 * Komplexer Fall: die Steps rufen den echten Zweiphasen-Pfad (analyze/finalize)
 * selbst auf (`run`) statt einer einzelnen Action. Das Gerüst (Env-Gate, Report,
 * Schwellwert) kommt aus `defineEval` — siehe defineEval.ts für den Schnellweg
 * bei einfachen Ein-Call-Prompts.
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval   (oder via .env)
 *
 * Ausgewertet werden IMMER die echten Produktions-Prompts. Um einen Prompt zu tunen,
 * ändert man ihn direkt in der Action und läuft die Eval erneut — jeder Lauf schreibt
 * einen eigenen Report nach evals/reports/<timestamp>-featureeffects[-<label>]/.
 */
import { defineEval } from './defineEval';
import { buildDruidCircleCases, type StepResult } from './cases/featureEffects-druid-circle';

defineEval<StepResult>({
  name: 'featureEffects',
  description: 'Druide 2→3, Zirkel des Landes — Landart-Wahl (Analyse) und Kreissprüche (Finalisierung)',
  cases: buildDruidCircleCases,
});

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
import { buildDruidCircleCases } from './cases/featureEffects-druid-circle';
import { buildRogueThiefCases } from './cases/featureEffects-rogue-thief';
import type { StepResult } from './cases/featureEffectsStep';

defineEval<StepResult>({
  name: 'featureEffects',
  description:
    'Druide 2→3, Zirkel des Landes — keine Aufstiegs-Wahl (Landart fällt pro langer Rast), ' +
    'dafür die Stufe-3-Kreissprüche aller vier Landarten',
  cases: buildDruidCircleCases,
});

/**
 * Gegenprobe auf demselben Pfad: ein Aufstieg ohne jede erzwungene Wahl und ohne Zauber.
 * Eigene Strecke (eigener Report), damit die „darf nichts erfinden"-Quote nicht mit der
 * Druiden-Quote verrechnet wird.
 */
defineEval<StepResult>({
  name: 'featureEffects-rogue',
  description: 'Schurke 2→3, Dieb — weder Wahl noch Zauber: prüft, dass die KI nichts erfindet',
  cases: buildRogueThiefCases,
});

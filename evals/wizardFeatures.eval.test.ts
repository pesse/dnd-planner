/**
 * Eval: Merkmalsanalyse im Charakter-Erstell-Wizard — Gnom-Zauberer, Hintergrund „Weiser".
 *
 * Gegenstück zur `featureEffects`-Strecke (Stufenaufstieg): dort steckt die Wahl in einem
 * Subklassen-Merkmal, hier in der SPEZIES („Gnomische Abstammung") und im Herkunftstalent
 * des Hintergrunds („Eingeweihter der Magie" = eine reine Zauber-Wahl). Gemessen wird derselbe
 * Zweiphasen-Pfad, aber mit dem Eingang, den `CharacterWizard.kickoff()` baut.
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   npm run eval -- --eval wizardFeatures --runs 3
 *
 * Call 1 sind zwei Calls (Analyse + Übersetzung der Wahlen), Call C fünf (dieselben zwei,
 * dann Nach-Analyse + Guided + Übersetzung der Bogen-Notizen) — bei `--runs 3` also 21.
 * Gemessen 2026-07-29: Analyse ø 58s, Nach-Analyse ø 27s, Guided ø 15s, die beiden
 * Übersetzungen ø 4s bzw. 3s — thinking-frei und damit rund 6 % der Kette.
 * Report je Lauf unter evals/reports/<timestamp>-wizardfeatures[-<label>]/.
 */
import { defineEval } from './defineEval';
import { buildGnomeSorcererCases } from './cases/wizardFeatures-gnome-sorcerer';
import type { StepResult } from './cases/featureEffectsStep';

defineEval<StepResult>({
  name: 'wizardFeatures',
  description:
    'Gnom-Zauberer / Weiser auf Stufe 1 — Volks-Abstammung als blockierende Aufbau-Wahl, ' +
    'Eingeweihter der Magie als Zauber-Wahl je Gradband, fünf wahllose Merkmale als Negativprobe',
  cases: buildGnomeSorcererCases,
});

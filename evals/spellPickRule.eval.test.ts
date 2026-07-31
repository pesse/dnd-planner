/**
 * Eval: leistet die spell-pick-Regel des Analyse-Prompts etwas für die Merkmale, die noch
 * an ihr hängen? Referenzfall „Magische Entdeckungen" (Barde 5→6, Kolleg des Wissens).
 *
 * Diese Strecke existiert, weil der geplante Prompt-Schnitt (1f) sonst blind wäre: fünf
 * Klassenmerkmale (Magische Entdeckungen, Mystisches Arkanum, Hervorrufungs-Gelehrter,
 * Signaturzauber, Zaubermeisterschaft) haben eine Zauber-Wahl, die NICHT deklariert werden kann — für sie ist die Regel das einzige, was zwischen
 * dem Spieler und einer fehlenden Zauber-Auswahl steht. Gemessen wird deshalb der Prompt
 * MIT Regel gegen den Prompt OHNE (zwei Läufe, `--title`).
 *
 * Macht echte LLM-Calls (QM_API_KEY + EVAL_MODEL nötig, sonst übersprungen).
 */
import { defineEval } from './defineEval';
import { buildBardLoreCases } from './cases/spellPickRule-bard-lore';
import type { StepResult } from './cases/featureEffectsStep';

defineEval<StepResult>({
  name: 'spellPickRule',
  description:
    'Magische Entdeckungen (Barde 5→6, Kolleg des Wissens) — zwei Zauber aus drei Listen, ' +
    'Gradband 0–3: entsteht die Zauber-Wahl mit richtigem Kontingent, Band und Listen-Key?',
  cases: buildBardLoreCases,
});

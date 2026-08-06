/**
 * Eval: Prompt-Qualität des Notiz-Passes (`summarizeFeatureNotes`) — die einzige Stelle, an
 * der die KI noch Merkmale deutet. Die Steps rufen den echten Produktionspfad selbst auf
 * (`run`), inklusive Übersetzung ins Deutsche; das Gerüst (Env-Gate, Report, Schwellwert)
 * kommt aus `defineEval`.
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval -- --eval featureNotes
 *
 * Ausgewertet werden IMMER die echten Produktions-Prompts. Um einen Prompt zu tunen,
 * ändert man ihn direkt in der Action und läuft die Eval erneut — jeder Lauf schreibt
 * einen eigenen Report nach evals/reports/<timestamp>-featurenotes[-<label>]/.
 */
import type { FeatureNote } from '../src/lib/schemas/levelUp';
import { defineEval } from './defineEval';
import { buildDruidNoteCases } from './cases/featureNotes-druid-circle';
import { buildRogueNoteCases } from './cases/featureNotes-rogue-thief';

defineEval<FeatureNote[]>({
  name: 'featureNotes',
  description:
    'Druide 2→3, Zirkel des Landes — Notiz zur Mechanik der aktuellen Stufe, ohne die '
    + 'deterministisch gewährte Kreisspruch-Liste und ohne Wachstumsklausel',
  cases: buildDruidNoteCases,
});

/**
 * Gegenprobe auf demselben Pfad: drei Merkmale, die auf dem Bogen sonst nirgends stehen.
 * Eigene Strecke (eigener Report), damit die „muss schreiben"-Quote nicht mit der
 * „darf nicht aufzählen"-Quote des Druiden verrechnet wird.
 */
defineEval<FeatureNote[]>({
  name: 'featureNotes-rogue',
  description: 'Schurke 2→3, Dieb — je Merkmal genau eine Bogenzeile, keine erfundene Mechanik',
  cases: buildRogueNoteCases,
});

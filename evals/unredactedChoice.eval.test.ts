/**
 * Eval: der Pfad „unredigierter Zweig geht an Pass C" (Elf-Kämpfer Stufe 1,
 * Elfenabstammung → „Drow").
 *
 * `unredactedChoiceFeatures` schickt ein Merkmal, dessen WAHL deklariert ist und dessen
 * WIRKUNG nicht, mit der getroffenen Antwort als `choice` in den Finalize-Eingang. Gemessen
 * wird, was daran wirklich KI-Arbeit ist: die Prosa der gewählten Tabellenzeile. Die
 * Gegenprobe (`grants: {}` → kein Call) läuft im selben Report, ohne LLM.
 *
 * Macht ECHTE LLM-Calls über QualityMinds und ist daher per env-Key gated — ohne
 * QM_API_KEY + EVAL_MODEL wird die Suite komplett übersprungen (kein CI-Bruch).
 *
 *   npm run eval -- --eval unredactedChoice --runs 3
 */
import { defineEval } from './defineEval';
import { buildElvenLineageCases, type UnredactedResult } from './cases/unredactedChoice-elven-lineage';

defineEval<UnredactedResult>({
  name: 'unredactedChoice',
  description:
    'Elf-Kämpfer Stufe 1, Elfenabstammung → „Drow": Pass C deutet die Prosa des gewählten ' +
    'Zweigs (Dunkelsicht 36 m), erfindet weder Zauber noch eine zweite Wahl — und fällt ganz ' +
    'weg, sobald der Zweig `grants: {}` deklariert',
  cases: buildElvenLineageCases,
});

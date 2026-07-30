/**
 * Eval: der Talent-Pfad des Stufenaufstiegs (Kämpfer 3→4, „Magiekundiger").
 *
 * Der Pfad war nie gemessen. Die Strecke fährt ihn zweimal — einmal über die KI-Deutung
 * (Fall A, wie bis 2026-07-30), einmal über die Deklaration (Fall B, ohne LLM) — mit
 * DENSELBEN Prüfungen. Was Fall A verfehlt und Fall B hält, ist der Unterschied, den die
 * Umstellung ausmacht; was beide halten, war nie das Problem.
 *
 * Gatet wird nur Fall B (Begründung im Case-Modul): Fall A ist für ein deklariertes Talent
 * nicht mehr der Weg der Anwendung, seine Zahlen sind Referenz.
 *
 * Echte LLM-Calls (Fall A) über QualityMinds, daher per env-Key gated:
 *   npm run eval -- --eval levelUpFeat --runs 5
 */
import { defineEval } from './defineEval';
import { buildMagicInitiateCases, type FeatPathResult } from './cases/levelUpFeat-magic-initiate';

defineEval<FeatPathResult>({
  name: 'levelUpFeat',
  description:
    'Kämpfer 3→4 nimmt „Magiekundiger": Zauberliste, Zauberattribut und Kontingent — ' +
    'KI-Deutung (A) gegen deklarierten Zugang (B), gleiche Prüfungen',
  cases: buildMagicInitiateCases,
});

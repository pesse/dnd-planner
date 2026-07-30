/**
 * Eval: was die Deklaration eines Zweig-Merkmals kostet und bringt — „Unholdisches Erbe"
 * (Tiefling, Stufe 1) auf beiden Wegen, mit EINEM Satz Prüfungen.
 *
 * Die Strecke misst keinen Prompt, sondern eine Architektur-Entscheidung: derselbe Charakter,
 * dasselbe Merkmal, einmal komplett durch die KI (Fall A, der Stand vor der Deklaration) und
 * einmal deterministisch geführt (Fall B, so wie es jetzt im Vault steht). Was am Charakter
 * ankommt, muss gleich sein; unterschiedlich sind Calls, Latenz und Tokens im Report.
 *
 *   npm run eval -- --eval declaredVsAi --runs 5 --concurrency 1
 */
import { defineEval } from './defineEval';
import { buildFiendishLegacyCases, type LegacyResult } from './cases/declaredVsAi-fiendish-legacy';

defineEval<LegacyResult>({
  name: 'declaredVsAi',
  description:
    'Unholdisches Erbe (Tiefling, Stufe 1, „Infernal") — KI-Weg gegen deklarierten Weg: ' +
    'gleiches Ergebnis am Charakter, unterschiedliche Kosten',
  cases: buildFiendishLegacyCases,
});

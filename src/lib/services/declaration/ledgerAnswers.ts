/**
 * Die LESENDE Seite von `character.features`: welche Antworten stehen zu einem Merkmal?
 * Ein Merkmal trägt mehrere Einträge unter demselben `sourceKey` — Zweigwahl, Zauberliste und
 * Zauberattribut —, auseinander hält sie erst der WERT. Wer hier liest, filtert also
 * anschließend gegen seine eigene Wertemenge.
 */

/** Ein Ledger-Eintrag, soweit das Lesen ihn braucht. */
export interface LedgerAnswerEntry {
  sourceKey?: string;
  choice: string;
  gainedAt?: number;
}

/**
 * Erst die Antworten GENAU dieser Instanz, dann die übrigen desselben Keys: Altbestand und
 * PDF-Import tragen kein `gainedAt`, und ohne die Nachsicht wäre eine vorhandene Antwort für
 * sie unsichtbar. Ein zweimal vergebenes Merkmal bekommt damit die eigene Antwort zuerst.
 */
export function ledgerAnswers(
  ledger: readonly LedgerAnswerEntry[],
  featureKey: string,
  gainedAt?: number,
): string[] {
  if (!featureKey) return [];
  const own: string[] = [];
  const rest: string[] = [];
  for (const e of ledger) {
    if ((e.sourceKey ?? '') !== featureKey) continue;
    const value = e.choice.trim();
    if (!value) continue;
    (gainedAt !== undefined && e.gainedAt === gainedAt ? own : rest).push(value);
  }
  return [...own, ...rest];
}

/** Die erste Antwort, die zur Wertemenge des Fragenden passt; Vergleich ohne Groß/Klein. */
export function pickAnswer<T extends string>(values: readonly string[], allowed: readonly T[]): T | null {
  const byLower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  for (const value of values) {
    const hit = byLower.get(value.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

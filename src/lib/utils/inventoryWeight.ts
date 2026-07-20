/**
 * Gewichts-Berechnung fürs Charakter-Inventar.
 *
 * `weight` einer Inventarzeile ist das Gewicht PRO STÜCK (so wird es aus der
 * Bibliothek übernommen), `count` die Anzahl. Die tatsächliche Last einer Zeile
 * ist folglich `count × weight`; die Gesamtlast die Summe über alle Zeilen.
 */

export interface InventoryLine {
  count?: string;
  weight?: string;
}

/** Liest eine (ggf. deutsche „1,5") Zahl aus einem Freitextfeld; NaN wenn leer/unlesbar. */
function parseNum(s: string | undefined | null): number {
  if (!s) return NaN;
  const cleaned = s.replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return NaN;
  return parseFloat(cleaned);
}

/** Last einer einzelnen Zeile: `count × weight` (leere/ungültige Anzahl zählt als 1). */
export function lineWeightKg(line: InventoryLine): number {
  const w = parseNum(line.weight);
  if (!isFinite(w)) return 0;
  const c = parseNum(line.count);
  const qty = isFinite(c) && c > 0 ? c : 1;
  return w * qty;
}

/** Gesamtlast über alle Zeilen. */
export function totalWeightKg(inventory: InventoryLine[]): number {
  return inventory.reduce((sum, line) => sum + lineWeightKg(line), 0);
}

/** Zahl → kompakte deutsche Darstellung (max. 3 Nachkommastellen, ohne Nullen, Komma). */
export function formatKg(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString().replace('.', ',');
}

/** Bequemer Einzeiler: formatierte Gesamtlast (leer, wenn nichts wiegt). */
export function formatTotalWeight(inventory: InventoryLine[]): string {
  const total = totalWeightKg(inventory);
  return total > 0 ? formatKg(total) : '';
}

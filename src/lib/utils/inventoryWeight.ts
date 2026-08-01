/**
 * Gewichts-Berechnung fürs Charakter-Inventar. `weight` einer Zeile ist das Gewicht
 * PRO STÜCK (so kommt es aus der Bibliothek), die Last der Zeile also `count × weight`.
 */

export interface InventoryLine {
  count?: string;
  weight?: string;
}

/** Freitextfeld, also auch deutsche Kommazahlen; NaN wenn leer/unlesbar. */
function parseNum(s: string | undefined | null): number {
  if (!s) return NaN;
  const cleaned = s.replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!cleaned) return NaN;
  return parseFloat(cleaned);
}

/** Leere oder ungültige Anzahl zählt als 1. */
export function lineWeightKg(line: InventoryLine): number {
  const w = parseNum(line.weight);
  if (!isFinite(w)) return 0;
  const c = parseNum(line.count);
  const qty = isFinite(c) && c > 0 ? c : 1;
  return w * qty;
}

export function totalWeightKg(inventory: InventoryLine[]): number {
  return inventory.reduce((sum, line) => sum + lineWeightKg(line), 0);
}

/** Deutsche Darstellung, max. 3 Nachkommastellen. */
export function formatKg(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toString().replace('.', ',');
}

/** Leer, wenn nichts wiegt. */
export function formatTotalWeight(inventory: InventoryLine[]): string {
  const total = totalWeightKg(inventory);
  return total > 0 ? formatKg(total) : '';
}

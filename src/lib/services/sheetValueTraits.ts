/**
 * Speziesmerkmale, die reine Bogenwerte sind (Größe, Bewegungsrate) — sie gehen NICHT in die
 * Merkmals-Deutung: Pass C bezahlt sonst für jeden das volle, leere Rider-Gerüst, und die
 * Notiz-Doktrin verbietet dort ohnehin eine Zeile (`SHEET_NOTE_EXAMPLE_EN`).
 *
 * Erkannt wird ausschließlich am Diskriminator `sheetValue`. Fehlt er, bleibt das Merkmal bei
 * der KI — Mensch und Tiefling wählen ihre Größe, und diese Wahl darf nicht still verschwinden.
 */
import type { SheetValueTrait } from '../schemas/species';

export interface SheetValueSource {
  sheetValue?: SheetValueTrait;
}

export function isSheetValueTrait(t: SheetValueSource): boolean {
  return t.sheetValue !== undefined;
}

export function withoutSheetValueTraits<T extends SheetValueSource>(traits: T[]): T[] {
  return traits.filter((t) => !isSheetValueTrait(t));
}

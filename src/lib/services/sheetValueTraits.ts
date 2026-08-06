/**
 * Speziesmerkmale, die reine Bogenwerte sind (Größe, Bewegungsrate): ihr Wert steht über
 * `grants.properties` auf dem Bogen, zu deuten ist an ihnen nichts.
 *
 * Erkannt wird ausschließlich am Diskriminator `sheetValue`. Fehlt er, gilt das Merkmal als
 * deutungsbedürftig — Mensch und Tiefling WÄHLEN ihre Größe, und diese Wahl darf nicht still
 * verschwinden.
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

/**
 * Die Bedingung, unter der eine Deklaration greift — an Kontingent, Vorrat und Talentwahl
 * dieselbe Form. Bezug ist immer DASSELBE Merkmal.
 */
import { z } from 'zod';

/**
 * Ein Record statt eines Objekts mit zwei Feldern: ein unbekannter Schlüssel soll als
 * Deklarationsfehler gemeldet werden, nicht beim Laden stumm wegfallen.
 */
export const whenSchema = z
  .record(z.string(), z.string())
  .describe(
    'Bedingung auf DASSELBE Merkmal. {"option":"High Elf"} = Antwort seines grantsChoice.optionList; '
    + '{"pick":"Armor of Shadows"} = Option unter den Wahlen seines grantsChoice.optionPool. Mehrere Schlüssel = alle.',
  );

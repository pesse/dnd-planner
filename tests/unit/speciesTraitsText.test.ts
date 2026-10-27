/**
 * Die Senke der Volksmerkmale im Aufstieg: anhängend je Zeile, damit derselbe Aufstieg ein
 * zweites Mal angewandt nichts doppelt und der Text des Spielers stehen bleibt.
 *
 *   npm run test -- speciesTraitsText
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import type { Change } from '../../src/lib/schemas/levelUp';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { speciesTraitsTextChanges } from '../../src/lib/services/levelUp/changes';

const FLIGHT = 'Drakonischer Flug: Ab Charakterstufe 5 kannst du dir Flügel wachsen lassen.';

const character = (rassenmerkmale: string): Character =>
  characterSchema.parse({ name: 'Prüfling', personal: { rassenmerkmale } });

const apply = (c: Character, changes: Change[]): Character => {
  applyChanges(c, changes, { classIndex: 0 });
  return c;
};

describe('speciesTraitsText', () => {
  it('hängt neue Zeilen an den vorhandenen Text an', () => {
    const c = apply(character('Odemwaffe: 1W10'), speciesTraitsTextChanges([FLIGHT]));
    expect(c.personal.rassenmerkmale).toBe(`Odemwaffe: 1W10\n${FLIGHT}`);
  });

  it('doppelt eine Zeile nicht, wenn derselbe Aufstieg erneut angewandt wird', () => {
    const c = apply(apply(character(''), speciesTraitsTextChanges([FLIGHT])), speciesTraitsTextChanges([FLIGHT]));
    expect(c.personal.rassenmerkmale).toBe(FLIGHT);
  });

  it('erzeugt ohne Zeilen keinen Change', () => {
    expect(speciesTraitsTextChanges([])).toEqual([]);
  });
});

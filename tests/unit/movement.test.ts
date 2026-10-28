/**
 * Bewegungsarten und Sinne aus `grants.speeds`/`grants.senses`.
 *
 *   npm run test -- movement
 */
import { describe, expect, it } from 'vitest';
import { characterMovement, type MovementFeature } from '../../src/lib/services/movement';
import { featureGrantSchema } from '../../src/lib/schemas/grants';

const feature = (name: string, grants: unknown): MovementFeature =>
  ({ key: name, name, grants: featureGrantSchema.parse(grants) });

const lines = (features: MovementFeature[], walk: number | null) =>
  characterMovement(features, walk).map((l) => [l.labelDe, l.valueDe, l.whenDe]);

describe('characterMovement', () => {
  it('Dunkelsicht: die größte feste Reichweite, stapelnde Merkmale zählen obendrauf', () => {
    const out = lines([
      feature('Dunkelsicht', { senses: [{ sense: 'darkvision', feet: 60 }] }),
      feature('Schattensicht', { senses: [{ sense: 'darkvision', feet: 60, stacks: true }] }),
    ], 30);
    expect(out).toEqual([['Dunkelsicht', '36 m', '']]);
  });

  it('stapelnd ohne eigene Dunkelsicht gilt der Wert selbst', () => {
    expect(lines([feature('Schattensicht', { senses: [{ sense: 'darkvision', feet: 60, stacks: true }] })], 30))
      .toEqual([['Dunkelsicht', '18 m', '']]);
  });

  it('„wie Bewegungsrate" rechnet dauerhafte Erhöhungen mit ein', () => {
    const out = lines([
      feature('Aura der Behändigkeit', { speeds: [{ mode: 'walk', feet: 10, bonus: true }] }),
      feature('Kletteraffe', { speeds: [{ mode: 'climb', feet: 'speed' }] }),
    ], 30);
    expect(out).toEqual([['Bewegungsrate', '+3 m', ''], ['Klettern', '12 m', '']]);
  });

  it('ohne bekannte Bewegungsrate keine erfundene Zahl; Lagen stehen als eigene Zeile', () => {
    const out = lines([
      feature('Sturmgeboren', { speeds: [{ mode: 'fly', feet: 'speed', condition: 'while Wrath of the Sea is active', conditionDe: 'solange dein Zorn des Meeres aktiv ist' }] }),
      feature('Wasserverbundenheit', { speeds: [{ mode: 'swim', feet: 'speed' }] }),
    ], null);
    expect(out).toEqual([
      ['Schwimmen', 'wie Bewegungsrate', ''],
      ['Fliegen', 'wie Bewegungsrate', 'solange dein Zorn des Meeres aktiv ist'],
    ]);
  });
});

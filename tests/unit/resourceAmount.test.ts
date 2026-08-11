/**
 * Die fünf Maximums-Mechaniken als reine Rechnung — eine Zählform, fünf Belegungen.
 *
 *   npm run test -- resourceAmount
 */
import { describe, expect, it } from 'vitest';
import { abilityRecordOf } from '../../src/lib/schemas/abilities';
import { amountSchema, type Amount } from '../../src/lib/schemas/amount';
import { resolveAmount, type AmountContext } from '../../src/lib/services/resources/amount';

const ctx = (over: Partial<AmountContext> = {}): AmountContext => ({
  level: 5,
  profBonus: 3,
  mods: abilityRecordOf(() => 0),
  column: () => undefined,
  ...over,
});

const parse = (raw: unknown): Amount => amountSchema.parse(raw);

describe('Mengen', () => {
  it('1 · liest die Stufentabelle der Klasse', () => {
    const c = ctx({ column: (name) => (name === 'Rages' ? '3' : undefined) });
    expect(resolveAmount(parse({ column: 'Rages' }), c)).toBe(3);
    // „—" in der Tabelle heißt: noch keine.
    expect(resolveAmount(parse({ column: 'Wild Shape' }), c)).toBe(0);
  });

  it('2 · = Klassenstufe, als Formel statt als Spalte', () => {
    const sorceryPoints = parse({ base: 1, perLevel: 1 });
    expect(resolveAmount(sorceryPoints, ctx({ level: 2 }))).toBe(2);
    expect(resolveAmount(sorceryPoints, ctx({ level: 20 }))).toBe(20);
  });

  it('3 · Attributsmodifikator, mindestens einmal', () => {
    const bardic = parse({ abilityMod: 'Charisma' });
    expect(resolveAmount(bardic, ctx({ mods: abilityRecordOf(() => 4) }))).toBe(4);
    // Ein Barde mit CHA 8 inspiriert trotzdem einmal.
    expect(resolveAmount(bardic, ctx({ mods: abilityRecordOf(() => -1) }))).toBe(1);
  });

  it('4 · eigene Progressionsformel: halbe Magierstufe, aufgerundet', () => {
    const recovery = parse({ base: 1, perLevel: 1, divide: 2, round: 'up' });
    expect([1, 2, 3, 5, 20].map((level) => resolveAmount(recovery, ctx({ level })))).toEqual([1, 1, 2, 3, 10]);
  });

  it('5 · feste Anzahl und Übungsbonus', () => {
    expect(resolveAmount(parse(2), ctx())).toBe(2);
    expect(resolveAmount(parse('proficiency-bonus'), ctx({ profBonus: 6 }))).toBe(6);
  });

  it('nimmt `{}` nicht als Formel an — `base` ist Pflicht', () => {
    expect(() => parse({})).toThrow();
    expect(() => parse({ perLevel: 1 })).toThrow();
  });
});

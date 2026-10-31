import { describe, expect, it } from 'vitest';
import { diceDe, parseDice, throwDice } from '../../src/lib/utils/dice';
import { buildDie } from '../../src/lib/components/ui/die/geometry';

describe('Würfelformeln', () => {
  it('liest Anzahl, Seiten und Zuschlag', () => {
    expect(parseDice('1d8+1')).toEqual({ count: 1, sides: 8, bonus: 1 });
    expect(parseDice('d3')).toEqual({ count: 1, sides: 3, bonus: 0 });
    expect(parseDice('4d10')).toEqual({ count: 4, sides: 10, bonus: 0 });
    expect(parseDice('W6')).toBeNull();
    expect(diceDe(parseDice('1d8+1')!)).toBe('1W8+1');
  });

  it('summiert die Würfel samt Zuschlag', () => {
    const t = throwDice({ count: 2, sides: 10, bonus: 1 }, () => 0.95);
    expect(t.rolls).toEqual([10, 10]);
    expect(t.total).toBe(21);
  });

  it('wirft den W3 mit drei Seiten', () => {
    const t = throwDice({ count: 1, sides: 3, bonus: 0 }, () => 0.7);
    expect(t.rolls).toEqual([3]);
    expect(t.total).toBe(3);
  });

  it('trägt auf dem W3-Körper jede Zahl zweimal', () => {
    expect(buildDie(3).faces.map((f) => f.value).sort()).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

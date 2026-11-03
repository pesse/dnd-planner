import { describe, expect, it } from 'vitest';
import { addToPool, diceDe, EMPTY_POOL, parseDice, parsePool, poolDe, throwDice, throwPool } from '../../src/lib/utils/dice';
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

describe('Würfelpool', () => {
  it('liest gemischte Würfel mit W oder d und fasst gleiche zusammen', () => {
    expect(parsePool('3W8 + w6 + 2d8 - 1')).toEqual({ dice: [{ count: 5, sides: 8 }, { count: 1, sides: 6 }], bonus: -1 });
    expect(parsePool('W20+5')).toEqual({ dice: [{ count: 1, sides: 20 }], bonus: 5 });
  });

  it('lehnt abgezogene Würfel und Unsinn ab', () => {
    expect(parsePool('W20-W4')).toBeNull();
    expect(parsePool('3W')).toBeNull();
    expect(parsePool('')).toBeNull();
  });

  it('zählt angeklickte Würfel hoch und schreibt den Pool deutsch', () => {
    const pool = [8, 8, 6, 8].reduce((p, sides) => addToPool(p, sides), EMPTY_POOL);
    expect(poolDe(pool)).toBe('3W8 + 1W6');
    expect(poolDe({ ...pool, bonus: -2 })).toBe('3W8 + 1W6 − 2');
  });

  it('wirft alle Würfel des Pools und rechnet den Zuschlag dazu', () => {
    const t = throwPool({ dice: [{ count: 2, sides: 8 }, { count: 1, sides: 6 }], bonus: 3 }, () => 0.99);
    expect(t.dice).toEqual([{ sides: 8, value: 8 }, { sides: 8, value: 8 }, { sides: 6, value: 6 }]);
    expect(t.total).toBe(25);
  });
});

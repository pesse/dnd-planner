import { describe, expect, it } from 'vitest';
import { addedRoll, thrownRoll } from '../../src/lib/services/battleMap/rollMath';
import type { Roll } from '../../src/lib/services/battleMap/diceLog.svelte';

const roll = (formula: string): Roll => ({ id: 0, ...thrownRoll(formula)! });

describe('addedRoll', () => {
  it('Sturz 1W6 plus Stacheln 2W8 ergibt einen Wurf', () => {
    const first = roll('1W6');
    const sum = addedRoll(first, '2W8')!;
    expect(sum.label).toBe('1W6 + 2W8');
    expect(sum.dice.map((d) => d.sides)).toEqual([6, 8, 8]);
    expect(sum.dice[0].value).toBe(first.dice[0].value);
    expect(sum.total).toBe(sum.dice.reduce((n, d) => n + d.value, 0));
    expect(sum.landed).toBe(1);
  });

  it('gleiche Würfel zählen zusammen, Boni addieren sich', () => {
    const sum = addedRoll(roll('1W6+1'), '2W6+2')!;
    expect(sum.label).toBe('3W6 + 3');
    expect(sum.total).toBe(sum.dice.reduce((n, d) => n + d.value, 0) + 3);
  });

  it('ohne Wurf oder nach Vorteil/Nachteil gibt es nichts zu addieren', () => {
    expect(addedRoll(undefined, '2W8')).toBeNull();
    expect(addedRoll({ ...roll('1W20'), formula: '' }, '2W8')).toBeNull();
  });
});

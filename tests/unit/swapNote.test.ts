/**
 * Tauschtakt am Kontingent, auch wenn ein Merkmal einen zweiten Takt ergänzt.
 *
 *   npm run test -- swapNote
 */
import { describe, expect, it } from 'vitest';
import type { SwapRule } from '../../src/lib/schemas/casting';
import { swapNote } from '../../src/lib/services/spellcasting/grouped';
import type { QuotaState } from '../../src/lib/services/spellcasting/state';

const quota = (levels: number[], swap: SwapRule) => ({ view: { levels, swap } }) as unknown as QuotaState;

describe('swapNote', () => {
  it('nennt einen einzelnen Takt', () => {
    expect(swapNote(quota([1, 2], { spells: 'long-rest-one' }))).toBe('1 austauschen pro Lange Rast');
  });

  it('nennt ergänzte Takte nebeneinander', () => {
    expect(swapNote(quota([1, 2], { spells: ['long-rest-all', 'short-rest-one'] })))
      .toBe('nach jeder Langen Rast frei neu wählen, 1 austauschen pro Kurze Rast');
  });

  it('trennt Zauber und Zaubertricks, wenn die Quota beide führt', () => {
    expect(swapNote(quota([], { spells: ['long-rest-all', 'short-rest-one'], cantrips: 'long-rest-one' })))
      .toBe('Zauber: nach jeder Langen Rast frei neu wählen, 1 austauschen pro Kurze Rast · Zaubertricks: 1 austauschen pro Lange Rast');
  });
});

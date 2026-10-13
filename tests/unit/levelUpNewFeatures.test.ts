/**
 * Der Checkpoint „Neue Merkmale" steht in jedem Aufstieg zwischen Delta und Wahlen —
 * mit und ohne Unterklassenwahl.
 *
 *   npm run test -- levelUpNewFeatures
 */
import { describe, expect, it } from 'vitest';
import { advance, isCheckpoint, type AdvanceCtx, type StepId } from '../../src/lib/services/levelUp/steps';
import type { LevelUpDelta } from '../../src/lib/services/levelUp';

function ctx(delta: Partial<LevelUpDelta>): AdvanceCtx {
  return {
    delta: { triggersSubclassChoice: false, subclassOptions: [], ...delta } as LevelUpDelta,
    featsToPick: 0, styleWork: 0, baseChoices: 0, featChoices: 0,
  };
}

function checkpointsAfterStart(c: AdvanceCtx): StepId[] {
  const out: StepId[] = [];
  for (let s: StepId = advance('choose-class', c); s !== 'done'; s = advance(s, c)) {
    if (isCheckpoint(s)) out.push(s);
  }
  return out;
}

describe('Checkpoint „Neue Merkmale"', () => {
  it('folgt direkt auf das Grund-Delta', () => {
    expect(checkpointsAfterStart(ctx({}))).toEqual(['new-features', 'player-decisions', 'class-features', 'review']);
  });

  it('folgt bei einer Unterklassenwahl erst auf deren Delta', () => {
    const c = ctx({ triggersSubclassChoice: true, subclassOptions: [{ key: 'srd-2024_champion', name: 'Champion' }] as LevelUpDelta['subclassOptions'] });
    expect(checkpointsAfterStart(c).slice(0, 2)).toEqual(['subclass-choice', 'new-features']);
    expect(advance('subclass-delta', c)).toBe('new-features');
  });
});

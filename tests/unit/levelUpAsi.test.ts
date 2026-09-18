/**
 * Die Tabellen-Attributsverbesserung: eine Antwort, zwei Senken. Die Kodierung („+2" ist
 * dasselbe Attribut zweimal) und die Deckelung bei 20 hängen daran.
 *
 *   npm run test -- levelUpAsi
 */
import { describe, expect, it } from 'vitest';
import {
  ASI_ABILITY_MAX, asiAnswer, asiIncrements, asiModeOf, asiQuestionId, readAsiPick,
} from '../../src/lib/services/levelUp/asi';
import { countFeatsToPick } from '../../src/lib/services/levelUp/questions';
import { decisionChanges } from '../../src/lib/services/levelUp/changes';
import type { LevelUpDelta } from '../../src/lib/services/levelUp';

const delta = (asiCount: number): LevelUpDelta => ({ asiCount, hitDie: 0 } as LevelUpDelta);
const abilityChanges = (answers: Record<string, string | string[]>, asiCount = 1) =>
  decisionChanges({ delta: delta(asiCount), answers, conMod: 0, pickedCantrips: [], pickedLearned: [] })
    .filter((c) => c.target === 'ability');

describe('ASI-Antwort', () => {
  it('liest „+2" als dasselbe Attribut zweimal', () => {
    expect(readAsiPick(['con', 'con'])).toEqual({ kind: 'abilities', abilities: ['con', 'con'] });
    expect(asiIncrements(['con', 'con'])).toEqual([{ ability: 'con', value: 2 }]);
    expect(asiIncrements(['str', 'dex'])).toEqual([{ ability: 'str', value: 1 }, { ability: 'dex', value: 1 }]);
  });

  it('gibt eine halbe Wahl nicht als Antwort aus — der Checkpoint hält', () => {
    expect(asiAnswer('split', 'str', '')).toEqual([]);
    expect(asiAnswer('plus2', '', '')).toEqual([]);
    expect(asiAnswer('split', 'str', 'str')).toEqual([]);
    expect(asiAnswer('split', 'str', 'dex')).toEqual(['str', 'dex']);
    expect(asiAnswer('feat', '', '')).toEqual(['feat']);
  });

  it('findet aus jeder Antwort in die Bedienform zurück', () => {
    expect(asiModeOf(['con', 'con'])).toBe('plus2');
    expect(asiModeOf(['str', 'dex'])).toBe('split');
    expect(asiModeOf(['feat'])).toBe('feat');
    expect(asiModeOf(undefined)).toBe('');
  });
});

describe('ASI-Senken', () => {
  it('zählt nur die Talent-Antworten', () => {
    const answers = { [asiQuestionId(1)]: ['feat'], [asiQuestionId(2)]: ['con', 'con'] };
    expect(countFeatsToPick(delta(2), answers)).toBe(1);
  });

  it('schreibt die Erhöhung mit der Obergrenze der Stufentabelle', () => {
    expect(abilityChanges({ [asiQuestionId(1)]: ['con', 'con'] })).toEqual([
      expect.objectContaining({ ability: 'con', value: 2, max: ASI_ABILITY_MAX, source: 'asi' }),
    ]);
  });

  it('summiert über mehrere Aufstiegsstufen und lässt die Talent-Antwort leer', () => {
    const answers = { [asiQuestionId(1)]: ['str', 'dex'], [asiQuestionId(2)]: ['feat'], [asiQuestionId(3)]: ['str', 'str'] };
    expect(abilityChanges(answers, 3)).toEqual([
      expect.objectContaining({ ability: 'str', value: 3 }),
      expect.objectContaining({ ability: 'dex', value: 1 }),
    ]);
  });
});

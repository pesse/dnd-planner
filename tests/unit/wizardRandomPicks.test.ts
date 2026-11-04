/**
 * Auswahlregeln der Zufallsfüllung: gewürfelt wird nur unter gültigen Optionen, Getroffenes
 * bleibt, und „sinnvoll" schlägt Zufall.
 *
 *   npm run test -- wizardRandomPicks
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisChoice } from '../../src/lib/services/analysis/types';
import { preferring, randomChoiceAnswer, rankSkills, shuffled, topUp } from '../../src/lib/services/wizard/randomPicks';

/** Deterministischer Zufall, damit ein Fehlschlag reproduzierbar ist. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const choice = (over: Partial<AnalysisChoice>): AnalysisChoice => ({
  id: 'c1', feature: 'F', featureDe: 'F', featureKey: 'test_f',
  question: 'Choose', questionDe: 'Wähle', helpDe: '',
  type: 'choice', options: [], optionsDe: [], optionHelpDe: {},
  spellLevels: [], spellClass: '', spellSchools: [], spellTier: 'prepared', sourceId: '', quotaId: '',
  max: 1, isBuildDecision: true, ...over,
});

describe('Zufallsfüllung', () => {
  it('mischt, ohne etwas zu verlieren', () => {
    expect(shuffled([1, 2, 3, 4, 5], seeded(1)).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('ergänzt nur bis zur Zahl und behält die bisherige Wahl', () => {
    expect(topUp(['a'], ['b', 'a', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
    expect(topUp(['a', 'b'], ['c'], 1)).toEqual(['a', 'b']);
  });

  it('stellt Bevorzugtes nach vorn', () => {
    const out = preferring(['x', 'rec1', 'y', 'rec2'], (k) => k.startsWith('rec'), seeded(7));
    expect(out.slice(0, 2).sort()).toEqual(['rec1', 'rec2']);
  });

  it('wählt Fertigkeiten auf dem Hauptattribut vor denen auf dem Abwurfwert', () => {
    const scores = { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 13 };
    for (let seed = 1; seed < 20; seed++) {
      const ranked = rankSkills(['Athletics', 'Stealth', 'Acrobatics'], scores, seeded(seed));
      expect(ranked.at(-1)).toBe('Athletics');
    }
  });

  it('beantwortet Wahlen nur mit angebotenen Optionen, Freitext gar nicht', () => {
    const multi = choice({ type: 'multiselect', max: 2, options: ['A', 'B', 'C'] });
    const answer = randomChoiceAnswer(multi, seeded(3));
    expect(answer).toHaveLength(2);
    expect(answer.every((v) => multi.options.includes(v))).toBe(true);
    expect(randomChoiceAnswer(choice({ type: 'text' }), seeded(3))).toEqual([]);
    expect(randomChoiceAnswer(choice({ type: 'choice', options: [] }), seeded(3))).toEqual([]);
  });
});

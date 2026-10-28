/**
 * Die TP-Änderungen eines Aufstiegs: Würfel der neuen Stufen plus alles, was rückwirkend
 * wirkt — ein höherer KON-Mod und ein neu gewonnener Bonus je Stufe zählen für ALLE Stufen.
 */
import type { LevelUpDelta } from '../levelUp';
import type { Change } from '../../schemas/levelUp';
import type { Character } from '../../schemas/characterSchema';
import { mod } from '../../domain/skills';
import { cappedScore } from '../declaration/abilityIncrease';
import { effectiveScore, type WornAbilityEffect } from '../effectiveAbilities';
import { hpDiceTotalOf, plausibleDiceTotal, type HpBasis } from '../hitPoints';
import { hpFlatSum, hpPerLevelSum } from '../perLevelEffects';
import type { HpPerLevelSource } from './runState';

export interface HpBefore extends Pick<Character, 'hpMax' | 'hpDiceTotal'> {
  conScore: number;
  abilityEffects?: readonly WornAbilityEffect[];
  maxDice?: number;
}

export interface HitPointParams {
  delta: LevelUpDelta;
  answers: Record<string, string | string[]>;
  before: HpBefore;
  sources: readonly HpPerLevelSource[];
  /** Die übrigen Änderungen des Aufstiegs — ihre KON-Erhöhungen bestimmen den neuen Mod. */
  others: readonly Change[];
}

/** Beim Würfeln ist `hp_roll` bereits die SUMME aller neuen Stufen. */
function diceGain(delta: LevelUpDelta, answers: Record<string, string | string[]>): number {
  const rolled = Number(answers['hp_roll']);
  if (answers['hp_method'] === 'roll' && rolled > 0) return rolled;
  return (Math.floor(delta.hitDie / 2) + 1) * delta.levelsGained;
}

function conAfter(conScore: number, others: readonly Change[]): number {
  return others.reduce(
    (score, c) => (c.target === 'ability' && c.ability === 'con' ? cappedScore(score, c.value, c.max) : score),
    conScore,
  );
}

/**
 * Eine unmögliche Rückrechnung wird nicht festgeschrieben: dann trägt das Maximum etwas, das die
 * Formel nicht kennt, und der Aufstieg addiert nur.
 */
function diceTotalBefore(p: HitPointParams, conMod: number, level: number): number | null {
  if (level <= 0) return 0;
  if (p.before.hpDiceTotal !== undefined) return p.before.hpDiceTotal;
  const owned = p.sources.filter((s) => s.owned);
  const basis: HpBasis = { conMod, level, perLevel: hpPerLevelSum(owned), flat: hpFlatSum(owned), maxDice: p.before.maxDice };
  const total = hpDiceTotalOf(p.before, basis);
  return total !== null && plausibleDiceTotal(total, basis) ? total : null;
}

export function hitPointChanges(p: HitPointParams): Change[] {
  const { delta } = p;
  if (delta.hitDie <= 0) return [];
  const levelAfter = delta.newTotalLevel;
  const levelBefore = levelAfter - delta.levelsGained;
  const { conScore, abilityEffects = [] } = p.before;
  const conModBefore = mod(effectiveScore(conScore, abilityEffects, 'con'));
  const gain = diceGain(delta, p.answers);
  const conModAfter = mod(effectiveScore(conAfter(conScore, p.others), abilityEffects, 'con'));
  const conPart = conModAfter * levelAfter - conModBefore * levelBefore;

  const out: Change[] = [{ target: 'hpMax', value: gain, step: 'assemble-decisions', source: 'hit-dice', label: 'Trefferpunkte (Würfel)' }];
  if (conPart) out.push({ target: 'hpMax', value: conPart, step: 'assemble-decisions', source: 'con', label: 'Trefferpunkte (KON)' });
  for (const s of p.sources) {
    const value = !s.perLevel ? (s.owned ? 0 : s.amount) : s.amount * (s.owned ? delta.levelsGained : levelAfter);
    if (value) out.push({ target: 'hpMax', value, step: 'ongoing-effects', source: s.sourceKey || s.feature, label: s.feature });
  }

  const diceBefore = diceTotalBefore(p, conModBefore, levelBefore);
  if (diceBefore !== null)
    out.push({ target: 'hpDiceTotal', value: diceBefore + gain, step: 'assemble-decisions', source: 'hit-dice', label: 'Summe der Trefferwürfel' });
  return out;
}

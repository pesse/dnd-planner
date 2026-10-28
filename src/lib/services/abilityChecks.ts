/** Deklarierte Zuschläge und Vorteil auf Fertigkeitswürfe; Editor, Bogen und Druck rechnen damit. */
import type { CheckEffect } from '../schemas/abilityCheck';
import type { AbilityScores } from '../schemas/abilities';
import type { FeatureGrant } from '../schemas/grants';
import type { SkillDef } from '../domain/skills';
import { featureIdOf } from '../utils/text';
import { resolveSaveBonus } from './savingThrows';

export interface CheckSource {
  labelDe: string;
  effect: CheckEffect;
}

export interface SkillCheckEffects {
  rows: { labelDe: string; value: number }[];
  notes: string[];
  /** Vorteil ohne Bedingung — steht als „V" neben dem Wert. */
  advantage: boolean;
}

export function checkSources(features: readonly { key?: string; name: string; grants?: FeatureGrant }[]): CheckSource[] {
  const seen = new Set<string>();
  return features.flatMap((f) => {
    const id = featureIdOf(f);
    if (seen.has(id)) return [];
    seen.add(id);
    return (f.grants?.checks ?? []).map((effect) => ({ labelDe: f.name, effect }));
  });
}

const applies = (e: CheckEffect, def: Pick<SkillDef, 'en' | 'attr'>): boolean =>
  (!e.abilities.length && !e.skills.length) || e.abilities.includes(def.attr) || e.skills.includes(def.en);

export function skillCheckEffects(
  def: Pick<SkillDef, 'en' | 'attr'>,
  sources: readonly CheckSource[],
  ctx: { mods: AbilityScores; profBonus: number },
): SkillCheckEffects {
  const out: SkillCheckEffects = { rows: [], notes: [], advantage: false };
  for (const { labelDe, effect } of sources) {
    if (!applies(effect, def)) continue;
    if (effect.kind === 'bonus') {
      out.rows.push({ labelDe, value: resolveSaveBonus(effect.value, ctx.mods, ctx.profBonus) });
      continue;
    }
    const when = effect.conditionDe?.trim() || effect.condition?.trim();
    out.notes.push(`Vorteil (${labelDe})${when ? `: ${when}` : ''}`);
    if (!when) out.advantage = true;
  }
  return out;
}

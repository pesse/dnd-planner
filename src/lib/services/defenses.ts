/** Resistenzen und Immunitäten eines Charakters, aus den `grants.defenses` seiner Merkmale. */
import type { DefenseEffect } from '../schemas/defense';
import type { FeatureGrant } from '../schemas/grants';
import { CONDITIONS } from '../schemas/vocabulary';
import { DAMAGE_TYPE_LABELS } from '../itemLabels';
import { featureIdOf } from '../utils/text';

export interface DefenseFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface CharacterDefense {
  labelDe: string;
  effect: DefenseEffect;
}

export function characterDefenses(features: readonly DefenseFeature[]): CharacterDefense[] {
  const seen = new Set<string>();
  const out: CharacterDefense[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(...(f.grants?.defenses ?? []).map((effect) => ({ labelDe: f.name, effect })));
  }
  return out;
}

/** „Resistenz gegen Giftschaden; immun gegen den Zustand Vergiftet" — Bogen und Druck zeigen dieselbe Zeile. */
export function defenseTextDe(e: DefenseEffect): string {
  const damage = (types: readonly string[]) => types.map((t) => DAMAGE_TYPE_LABELS[t] ?? t).join(', ');
  const conditions = e.conditionImmunities.map((c) => CONDITIONS[c]).join(', ');
  return [
    ...(e.resistances.length ? [`Resistenz gegen ${damage(e.resistances)}`] : []),
    ...(e.immunities.length ? [`immun gegen ${damage(e.immunities)}`] : []),
    ...(conditions ? [`immun gegen ${e.conditionImmunities.length > 1 ? 'die Zustände' : 'den Zustand'} ${conditions}`] : []),
  ].join('; ');
}

export const defenseWhenDe = (e: DefenseEffect): string => e.conditionDe?.trim() || e.condition?.trim() || '';

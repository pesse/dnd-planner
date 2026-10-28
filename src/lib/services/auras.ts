/** Die Auren eines Charakters, aus den `grants.aura`-Beiträgen seiner Merkmale zusammengeführt. */
import type { AbilityScores } from '../schemas/abilities';
import type { FeatureGrant } from '../schemas/grants';
import { CONDITIONS, type Condition } from '../schemas/vocabulary';
import { featureIdOf } from '../utils/text';
import { sign } from '../utils/num';
import { resolveSaveBonus } from './savingThrows';

export interface AuraFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface CharacterAura {
  id: string;
  /** Name des erzeugenden Merkmals; fehlt es, der des ersten Beitrags. */
  nameDe: string;
  radiusFeet?: number;
  saveBonus?: number;
  conditionImmunities: Condition[];
  effects: { labelDe: string; text: string }[];
}

export function characterAuras(
  features: readonly AuraFeature[],
  ctx: { mods: AbilityScores; profBonus: number },
): CharacterAura[] {
  const byId = new Map<string, CharacterAura>();
  const seen = new Set<string>();
  for (const f of features) {
    const fid = featureIdOf(f);
    if (seen.has(fid)) continue;
    seen.add(fid);
    for (const part of f.grants?.aura ?? []) {
      const aura = byId.get(part.aura) ?? { id: part.aura, nameDe: f.name, conditionImmunities: [], effects: [] };
      byId.set(part.aura, aura);
      if (f.key === part.aura) aura.nameDe = f.name;
      if (part.radiusFeet !== undefined) aura.radiusFeet = Math.max(aura.radiusFeet ?? 0, part.radiusFeet);
      if (part.savingThrows !== undefined) {
        const bonus = resolveSaveBonus(part.savingThrows, ctx.mods, ctx.profBonus);
        aura.saveBonus = Math.max(aura.saveBonus ?? bonus, bonus);
      }
      for (const c of part.conditionImmunities)
        if (!aura.conditionImmunities.includes(c)) aura.conditionImmunities.push(c);
      const text = part.effectDe?.trim() || part.effect?.trim();
      if (text) aura.effects.push({ labelDe: f.name, text });
    }
  }
  return [...byId.values()];
}

/** Die Wirkungen als Zeilen — Bogen und Druck zeigen dieselben. */
export function auraLinesDe(aura: CharacterAura): string[] {
  return [
    ...(aura.saveBonus !== undefined ? [`${sign(aura.saveBonus)} auf alle Rettungswürfe`] : []),
    ...(aura.conditionImmunities.length ? [`immun gegen ${aura.conditionImmunities.map((c) => CONDITIONS[c]).join(', ')}`] : []),
    ...aura.effects.map((e) => `${e.text} (${e.labelDe})`),
  ];
}

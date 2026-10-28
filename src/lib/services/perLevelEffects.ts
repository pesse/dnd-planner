/**
 * TP-Zuschläge aus Merkmalen, deterministisch aus `grants.perLevel` und `grants.hpMaxBonus`.
 * Der Schub beim Erwerb („Zäh": zweifache Charakterstufe) ist derselbe Betrag rückwirkend —
 * `levelUp/hitPoints.ts` rechnet ein neues Merkmal über alle Stufen.
 */
import type { FeatureGrant } from '../schemas/grants';
import { featureIdOf } from '$lib/utils/text';

export interface PerLevelFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface PerLevelSource {
  feature: string;
  sourceKey: string;
  amount: number;
  /** Sonst ein fester Zuschlag, der einmal zählt. */
  perLevel: boolean;
}

/**
 * Dedupliziert über Key (ersatzweise Name): dasselbe Merkmal erreicht die Flows aus mehreren
 * Richtungen (Bibliotheks-Trait, neu gewonnen, Talent-Link) und zählte sonst doppelt.
 */
export function hpPerLevelSources(features: PerLevelFeature[]): PerLevelSource[] {
  const seen = new Set<string>();
  const out: PerLevelSource[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const amount = f.grants?.perLevel?.hpMax ?? 0;
    if (amount) out.push({ feature: f.name, sourceKey: f.key ?? '', amount, perLevel: true });
    const flat = f.grants?.hpMaxBonus ?? 0;
    if (flat) out.push({ feature: f.name, sourceKey: f.key ?? '', amount: flat, perLevel: false });
  }
  return out;
}

export function hpPerLevelSum(sources: readonly PerLevelSource[]): number {
  return sources.reduce((sum, s) => (s.perLevel ? sum + s.amount : sum), 0);
}

export function hpFlatSum(sources: readonly PerLevelSource[]): number {
  return sources.reduce((sum, s) => (s.perLevel ? sum : sum + s.amount), 0);
}

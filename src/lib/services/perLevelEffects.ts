/**
 * Fortlaufende, PRO STUFE wirkende TP-Effekte, deterministisch aus `grants.perLevel`.
 * Der Einmal-Schub beim Erwerb („Zäh": zweifache Charakterstufe) ist bewusst NICHT
 * modelliert — kein Flow wendet ihn an.
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
    if (amount) out.push({ feature: f.name, sourceKey: f.key ?? '', amount });
  }
  return out;
}

/** Summe der pro-Stufe-Beiträge (× gewonnene Stufen wendet der Aufrufer an). */
export function hpPerLevelSum(sources: PerLevelSource[]): number {
  return sources.reduce((sum, s) => sum + s.amount, 0);
}

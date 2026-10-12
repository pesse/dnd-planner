/**
 * Jedes deklarierbare Merkmal des echten Vaults — Klassen- und Subklassenmerkmale,
 * Speziesmerkmale, Talente — mit einer stabilen Id für Ausnahmelisten.
 */
import { getClasses } from '../../src/lib/classLibrary';
import { getFeats } from '../../src/lib/featsLibrary';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import type { GapCandidate } from '../../src/lib/services/declarationGap';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { libraryKey } from './libraryKey';

export interface VaultFeature {
  id: string;
  feature: GapCandidate;
}

let cached: VaultFeature[] | null = null;

export async function vaultFeatures(): Promise<VaultFeature[]> {
  if (cached) return cached;
  const out: VaultFeature[] = [];
  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(libraryKey(info));
    if (!prog) throw new Error(`Klasse nicht lesbar: ${info.key}`);
    for (const f of prog.features) out.push({ id: f.key || `${prog.key}:${f.name}`, feature: f });
  }
  for (const info of await getSpeciesList()) {
    const spec = await getSpeciesByKey(libraryKey(info));
    if (!spec) throw new Error(`Spezies nicht lesbar: ${info.key}`);
    for (const t of spec.traits) out.push({ id: t.key || `${spec.key}:${t.name}`, feature: t });
  }
  for (const feat of await getFeats()) out.push({ id: feat.sourceKey || feat.name, feature: feat });
  cached = out;
  return out;
}

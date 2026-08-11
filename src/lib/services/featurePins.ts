/**
 * Gepinnte Merkmale: die Auswahl, die der Ausdruck als Volltext anhängt. Einziger Schreibpfad
 * auf `character.pinnedFeatures` und die eine Stelle, die Keys wieder zu Merkmalen macht.
 */
import type { Character } from '$lib/schemas/characterSchema';
import type { ResolvedCharacterFeatures, ResolvedFeature } from './characterFeatures';

export interface FeaturePins {
  has(key: string | undefined): boolean;
  toggle(key: string): void;
}

/** `target` ist ein Getter, weil „Übernehmen" den Draft per NEUER Referenz ersetzt. */
export function createFeaturePins(target: () => Character): FeaturePins {
  return {
    has(key) {
      return !!key && (target().pinnedFeatures ?? []).includes(key);
    },
    toggle(key) {
      if (!key.trim()) return;
      const c = target();
      const pins = c.pinnedFeatures ?? [];
      // Geschrieben wird immer die ganze Liste, am Ende angehängt — wie im Merkmals-Ledger.
      c.pinnedFeatures = pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key];
    },
  };
}

/**
 * Die gepinnten Merkmale in Bogen-Reihenfolge. Ein Key, den keine Gruppe mehr führt, fällt
 * heraus statt als leerer Eintrag zu drucken; dasselbe Merkmal aus zwei Quellen (Herkunftstalent
 * und Talent-Link) steht einmal.
 */
export function pinnedFeatures(
  f: ResolvedCharacterFeatures,
  keys: string[] | undefined,
): ResolvedFeature[] {
  const pinned = new Set(keys ?? []);
  if (!pinned.size) return [];

  const groups = [...f.classGroups, ...f.speciesGroups, ...f.backgroundGroups];
  const out: ResolvedFeature[] = [];
  const seen = new Set<string>();
  for (const feature of [...groups.flatMap((g) => g.features), ...f.featEntries]) {
    if (!feature.key || !pinned.has(feature.key) || seen.has(feature.key)) continue;
    seen.add(feature.key);
    out.push(feature);
  }
  return out;
}

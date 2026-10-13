/**
 * Stimmungsbilder der Herkunfts-Schritte aus `static/art/`: `classes/<klasse>`, `species/<volk>`,
 * `backgrounds/<hintergrund>` und `combos/<volk>-<klasse>`, je `.webp`; der Name ist der
 * Bibliotheks-Key ohne Quellen-Präfix.
 */
import type { OriginKind } from './originCatalog';

/** `srd-2024_dwarf` → `dwarf` */
const slugOf = (key: string): string => key.slice(key.indexOf('_') + 1);

const artUrl = (name: string): string => `/art/${name}.webp`;

export interface OriginArtKeys {
  classKey: string;
  speciesKey: string;
  backgroundKey: string;
}

/** Das spezifischste zuerst, dann was im aktuellen Schritt im Vordergrund steht. */
export function originArtCandidates(kind: OriginKind, k: OriginArtKeys): string[] {
  const cls = k.classKey && `classes/${slugOf(k.classKey)}`;
  const spc = k.speciesKey && `species/${slugOf(k.speciesKey)}`;
  const bg = k.backgroundKey && `backgrounds/${slugOf(k.backgroundKey)}`;
  const combo = k.classKey && k.speciesKey && `combos/${slugOf(k.speciesKey)}-${slugOf(k.classKey)}`;
  const order = {
    class: [combo, cls, spc],
    species: [combo, spc, cls],
    background: [bg, combo, cls, spc],
  }[kind];
  return order.filter((n): n is string => !!n).map(artUrl);
}

// Welche Bilder es gibt, weiß erst der Server — die Serie wächst, ohne dass Code sie aufzählt.
const exists = new Map<string, Promise<boolean>>();

function probe(url: string): Promise<boolean> {
  let p = exists.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
    exists.set(url, p);
  }
  return p;
}

/**
 * Bilder, deren Aktion links liegt — dort sitzt die Karte. Die Serie ist sonst nach rechts gemalt;
 * ein neues nach links blickendes Bild gehört hier hinein.
 */
const MIRRORED = new Set(
  [
    'backgrounds/hermit', 'backgrounds/noble',
    'combos/dragonborn-sorcerer', 'combos/tiefling-sorcerer', 'combos/orc-warlock',
    'combos/fairy-wizard', 'combos/human-wizard', 'combos/orc-wizard', 'combos/human-monk',
  ].map(artUrl),
);

export const isMirroredArt = (url: string): boolean => MIRRORED.has(url);

export async function resolveOriginArt(candidates: string[]): Promise<string | null> {
  for (const url of candidates) if (await probe(url)) return url;
  return null;
}

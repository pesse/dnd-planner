/**
 * Stimmungsbilder aus `static/art/` (`.avif`, Name = Bibliotheks-Key ohne Quellen-Präfix): die Figur
 * je Volk und Äußerem unter `figures/<volk>-<äußeres>/{species,classes/<k>,backgrounds/<h>}`; für
 * Charaktere ohne Äußeres `classes/`, `backgrounds/`, `combos/`.
 */
import { PRESENTATIONS, type Presentation } from '$lib/schemas/characterSchema';
import type { OriginKind } from './originCatalog';

/** `srd-2024_dwarf` → `dwarf` */
export const slugOf = (key: string): string => key.slice(key.indexOf('_') + 1);

export const artUrl = (name: string): string => `/art/${name}.avif`;

export interface OriginArtKeys {
  classKey: string;
  speciesKey: string;
  backgroundKey: string;
  presentation?: Presentation;
}

/** Das spezifischste zuerst, dann was im aktuellen Schritt im Vordergrund steht. */
export function originArtNames(kind: OriginKind, k: OriginArtKeys): string[] {
  const cls = k.classKey && `classes/${slugOf(k.classKey)}`;
  const bg = k.backgroundKey && `backgrounds/${slugOf(k.backgroundKey)}`;
  const combo = k.classKey && k.speciesKey && `combos/${slugOf(k.speciesKey)}-${slugOf(k.classKey)}`;
  const fig = k.speciesKey && k.presentation && `figures/${slugOf(k.speciesKey)}-${k.presentation}`;
  const figSpc = fig && `${fig}/species`;
  const figCls = fig && k.classKey && `${fig}/classes/${slugOf(k.classKey)}`;
  const figBg = fig && k.backgroundKey && `${fig}/backgrounds/${slugOf(k.backgroundKey)}`;
  const order = {
    species: [figSpc, combo, cls],
    background: [figBg, bg, figSpc, combo],
    class: [figCls, combo, cls, figSpc],
  }[kind];
  return order.filter((n): n is string => !!n);
}

export const originArtCandidates = (kind: OriginKind, k: OriginArtKeys): string[] =>
  originArtNames(kind, k).map(artUrl);

/** Frontale Figur fürs Ausrüstungsmodell, in derselben Pose für alle Völker; zuletzt die Gliederpuppe. */
export const paperdollCandidates = (speciesKey: string, presentation: Presentation | undefined): string[] => [
  ...(speciesKey && presentation ? [artUrl(`figures/${slugOf(speciesKey)}-${presentation}/paperdoll`)] : []),
  artUrl('figures/paperdoll'),
];

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

/**
 * Lädt das Bild jedes Volks in jedem Äußeren vor, damit der Volk-Schritt nicht Bild für Bild
 * nachzieht. `onprogress` erhält den Anteil 0…1.
 */
export async function preloadSpeciesArt(speciesKeys: string[], onprogress?: (share: number) => void): Promise<void> {
  const lists = speciesKeys.flatMap((speciesKey) =>
    PRESENTATIONS.map((presentation) => originArtCandidates('species', { speciesKey, presentation, classKey: '', backgroundKey: '' })),
  );
  let done = 0;
  await Promise.all(lists.map(async (list) => {
    await resolveOriginArt(list);
    onprogress?.(++done / lists.length);
  }));
}

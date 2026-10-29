/** Die Bilder des Bilder-Reiters: je ein Stimmungsbild zu Volk, Hintergrund, Klassen und Unterklassen. */
import type { Character } from '$lib/schemas/characterSchema';
import { subclassArtNames } from './levelUp/subclassArt';
import { artUrl } from '$lib/artUrl';
import { originArtNames, resolveOriginArt, slugOf, type OriginArtKeys } from './wizard/originArt';

export interface ConceptArt {
  /** Bildname ohne Endung, z. B. `figures/dwarf-feminine/species` — überdauert einen Umzug der Bilder. */
  name: string;
  label: string;
  url: string;
}

interface ArtSlot {
  label: string;
  names: string[];
}

const ART_ID_PREFIX = 'art:';

/** Die Kennung in `printImages`; eigene Bilder stehen dort mit ihrem Dateipfad. */
export const artImageId = (name: string): string => `${ART_ID_PREFIX}${name}`;

/**
 * Nur Bilder, die das Merkmal des Platzes auch zeigen: die Kandidatenlisten fallen sonst aufs
 * Bild eines anderen Platzes zurück, und der Reiter zeigte es doppelt unter falschem Titel.
 */
const showing = (key: string, names: string[]): string[] => names.filter((n) => n.includes(slugOf(key)));

export function conceptArtSlots(c: Character): ArtSlot[] {
  const keys: OriginArtKeys = {
    classKey: '',
    speciesKey: c.species.sourceKey,
    backgroundKey: c.backgroundRef?.sourceKey ?? '',
    presentation: c.presentation,
  };
  const slots: ArtSlot[] = [];
  if (keys.speciesKey) {
    slots.push({ label: `Volk: ${c.species.name}`, names: showing(keys.speciesKey, originArtNames('species', keys)) });
  }
  if (keys.backgroundKey) {
    slots.push({ label: `Hintergrund: ${c.backgroundRef.name}`, names: showing(keys.backgroundKey, originArtNames('background', keys)) });
  }
  for (const cls of c.classes) {
    if (!cls.sourceKey) continue;
    const withClass = { ...keys, classKey: cls.sourceKey };
    slots.push({ label: `Klasse: ${cls.name}`, names: showing(cls.sourceKey, originArtNames('class', withClass)) });
    if (cls.subclassKey) {
      slots.push({
        label: `Unterklasse: ${cls.subclassName ?? slugOf(cls.subclassKey)}`,
        names: showing(cls.subclassKey, subclassArtNames(cls.subclassKey, withClass)),
      });
    }
  }
  return slots.filter((s) => s.names.length > 0);
}

async function firstExisting(names: string[]): Promise<string | null> {
  for (const name of names) if (await resolveOriginArt([artUrl(name)])) return name;
  return null;
}

/** Ein Bild, das zwei Plätze treffen, steht einmal — unter dem ersten. */
export async function resolveConceptArt(slots: ArtSlot[]): Promise<ConceptArt[]> {
  const found = await Promise.all(slots.map(async (s) => ({ label: s.label, name: await firstExisting(s.names) })));
  const seen = new Set<string>();
  return found.flatMap(({ label, name }) => {
    if (!name || seen.has(name)) return [];
    seen.add(name);
    // Absolut, weil der Druck die URL in ein eigenes Dokument trägt.
    return [{ name, label, url: new URL(artUrl(name), location.href).href }];
  });
}

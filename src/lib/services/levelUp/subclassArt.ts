/** Stimmungsbild der Subklasse: `figures/<volk>-<äußeres>/subclasses/<slug>`, sonst das Klassenbild. */
import type { Presentation } from '$lib/schemas/characterSchema';
import { artUrl } from '$lib/artUrl';
import { originArtNames, slugOf } from '../wizard/originArt';

type SubclassArtKeys = { classKey: string; speciesKey: string; presentation?: Presentation };

export function subclassArtNames(subclassKey: string, k: SubclassArtKeys): string[] {
  // Charaktere von vor dem Wizard haben kein Äußeres — dann zeigt irgendeine Figur ihres Volks die Subklasse.
  const looks: Presentation[] = k.presentation ? [k.presentation] : ['androgynous', 'masculine', 'feminine'];
  const own = k.speciesKey
    ? looks.map((look) => `figures/${slugOf(k.speciesKey)}-${look}/subclasses/${slugOf(subclassKey)}`)
    : [];
  return [...own, ...originArtNames('class', { ...k, backgroundKey: '' })];
}

export const subclassArtCandidates = (subclassKey: string, k: SubclassArtKeys): string[] =>
  subclassArtNames(subclassKey, k).map(artUrl);

/** Stimmungsbild der Subklasse: `figures/<volk>-<äußeres>/subclasses/<slug>`, sonst das Klassenbild. */
import type { Presentation } from '$lib/schemas/characterSchema';
import { artUrl, originArtCandidates, slugOf } from '../wizard/originArt';

export function subclassArtCandidates(subclassKey: string, k: { classKey: string; speciesKey: string; presentation?: Presentation }): string[] {
  const own = k.speciesKey && k.presentation
    ? [artUrl(`figures/${slugOf(k.speciesKey)}-${k.presentation}/subclasses/${slugOf(subclassKey)}`)]
    : [];
  return [...own, ...originArtCandidates('class', { ...k, backgroundKey: '' })];
}

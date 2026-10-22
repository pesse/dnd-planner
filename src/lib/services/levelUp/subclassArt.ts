/** Stimmungsbild der Subklasse: `figures/<volk>-<äußeres>/subclasses/<slug>`, sonst das Klassenbild. */
import type { Presentation } from '$lib/schemas/characterSchema';
import { artUrl, originArtCandidates, slugOf } from '../wizard/originArt';

export function subclassArtCandidates(subclassKey: string, k: { classKey: string; speciesKey: string; presentation?: Presentation }): string[] {
  // Charaktere von vor dem Wizard haben kein Äußeres — dann zeigt irgendeine Figur ihres Volks die Subklasse.
  const looks: Presentation[] = k.presentation ? [k.presentation] : ['androgynous', 'masculine', 'feminine'];
  const own = k.speciesKey
    ? looks.map((look) => artUrl(`figures/${slugOf(k.speciesKey)}-${look}/subclasses/${slugOf(subclassKey)}`))
    : [];
  return [...own, ...originArtCandidates('class', { ...k, backgroundKey: '' })];
}

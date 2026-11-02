/** Die Stimmungsbilder aus `vault/art/`, die zu einem Charakter passen — als Portrait-Vorlage. */
import { PRESENTATIONS, type Character, type Presentation } from '$lib/schemas/characterSchema';
import { artUrl } from '$lib/artUrl';
import { artExists, slugOf } from './wizard/originArt';

export type PortraitArtSource = Pick<Character, 'classes' | 'species' | 'backgroundRef'> & {
  presentation?: Presentation | '';
};

/** Die Figur des eigenen Äußeren zuerst; ohne Äußeres kommen alle drei in Frage. */
export function portraitArtNames(c: PortraitArtSource): string[] {
  const species = c.species.sourceKey && slugOf(c.species.sourceKey);
  const classes = c.classes.filter((cl) => cl.sourceKey);
  const background = c.backgroundRef.sourceKey && slugOf(c.backgroundRef.sourceKey);
  const looks = c.presentation ? [c.presentation] : [...PRESENTATIONS];
  return species
    ? looks.flatMap((look) => {
        const fig = `figures/${species}-${look}`;
        return [
          ...classes.flatMap((cl) => [
            ...(cl.subclassKey ? [`${fig}/subclasses/${slugOf(cl.subclassKey)}`] : []),
            `${fig}/classes/${slugOf(cl.sourceKey)}`,
          ]),
          ...(background ? [`${fig}/backgrounds/${background}`] : []),
          `${fig}/species`,
        ];
      })
    : [];
}

export async function resolvePortraitArt(c: PortraitArtSource): Promise<string[]> {
  const urls = portraitArtNames(c).map(artUrl);
  const found = await Promise.all(urls.map(artExists));
  return urls.filter((_, i) => found[i]);
}

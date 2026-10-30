/** Die Stimmungsbilder eines Bibliothekseintrags für seinen Bilder-Reiter, nach Volk gruppiert. */
import { PRESENTATIONS } from '$lib/schemas/characterSchema';
import { PRESENTATION_LABEL } from '$lib/domain/presentation';
import { artUrl } from '$lib/artUrl';
import { resolveOriginArt, slugOf } from './wizard/originArt';

export type ArtEntryKind = 'species' | 'class' | 'subclass' | 'background';

interface Candidate {
  name: string;
  label: string;
}

export interface ArtCandidateGroup {
  title: string;
  candidates: Candidate[];
}

export interface EntryArt {
  label: string;
  url: string;
}

export interface EntryArtGroup {
  title: string;
  images: EntryArt[];
}

const FOLDER = { class: 'classes', subclass: 'subclasses', background: 'backgrounds' } as const;

const figures = (speciesSlug: string, leaf: string): Candidate[] =>
  PRESENTATIONS.map((p) => ({ name: `figures/${speciesSlug}-${p}/${leaf}`, label: PRESENTATION_LABEL[p] }));

/** Ein Volk zeigt nur seine drei Grundfiguren, nicht die Figuren in Klasse oder Hintergrund. */
export function entryArtCandidates(
  kind: ArtEntryKind,
  key: string,
  species: { key: string; name: string }[],
): ArtCandidateGroup[] {
  const slug = slugOf(key);
  if (kind === 'species') return [{ title: '', candidates: figures(slug, 'species') }];
  const folder = FOLDER[kind];
  const general: ArtCandidateGroup[] = kind === 'subclass'
    ? []
    : [{ title: 'Allgemein', candidates: [{ name: `${folder}/${slug}`, label: 'Ohne Volk' }] }];
  return [
    ...general,
    ...species.map((s) => {
      const sp = slugOf(s.key);
      const combo = kind === 'class' ? [{ name: `combos/${sp}-${slug}`, label: 'Szene' }] : [];
      return { title: s.name, candidates: [...figures(sp, `${folder}/${slug}`), ...combo] };
    }),
  ];
}

export async function resolveEntryArt(groups: ArtCandidateGroup[]): Promise<EntryArtGroup[]> {
  const resolved = await Promise.all(groups.map(async (g) => {
    const found = await Promise.all(g.candidates.map(async (c) => {
      const url = await resolveOriginArt([artUrl(c.name)]);
      return url ? [{ label: c.label, url }] : [];
    }));
    return { title: g.title, images: found.flat() };
  }));
  return resolved.filter((g) => g.images.length > 0);
}

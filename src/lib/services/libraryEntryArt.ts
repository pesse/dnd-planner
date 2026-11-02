/** Die Stimmungsbilder eines Bibliothekseintrags für seinen Bilder-Reiter, nach Volk gruppiert. */
import { PRESENTATIONS } from '$lib/schemas/characterSchema';
import { PRESENTATION_LABEL } from '$lib/domain/presentation';
import { artUrl, availableArt } from '$lib/artUrl';
import { getSpeciesList, speciesDisplayName } from '$lib/speciesLibrary';
import { resolveOriginArt, slugOf } from './wizard/originArt';

export type ArtEntryKind = 'species' | 'class' | 'subclass' | 'background' | 'monster';

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
  if (kind === 'monster') {
    return [{ title: '', candidates: [{ name: `monster-scenes/${slug}`, label: 'Szene' }, { name: `monsters/${slug}`, label: 'Symbol' }] }];
  }
  const folder = FOLDER[kind];
  const general: ArtCandidateGroup[] = kind === 'subclass'
    ? []
    : [{ title: 'Allgemein', candidates: [{ name: `${folder}/${slug}`, label: 'Ohne Volk' }] }];
  return [
    ...general,
    ...species.map((s) => {
      const sp = slugOf(s.key);
      return { title: s.name, candidates: figures(sp, `${folder}/${slug}`) };
    }),
  ];
}

/** Die Völker, nach denen `entryArtCandidates` gruppiert. */
export async function artSpecies(): Promise<{ key: string; name: string }[]> {
  return (await getSpeciesList())
    .flatMap((s) => (s.key ? [{ key: s.key, name: speciesDisplayName(s) }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Alle vorhandenen Bilder eines Eintrags als URLs, synchron gegen eine `availableArt`-Liste statt
 * je Bild zu proben. Eine Unterklasse ohne eigene Figuren leiht sich das Bild ihrer Klasse.
 */
export function presentEntryArt(
  kind: ArtEntryKind,
  key: string,
  species: { key: string; name: string }[],
  names: Set<string>,
  parentKey?: string,
): string[] {
  const urls = entryArtCandidates(kind, key, species)
    .flatMap((g) => g.candidates.filter((c) => names.has(c.name)).map((c) => artUrl(c.name)));
  const parent = parentKey && `${FOLDER.class}/${slugOf(parentKey)}`;
  return !urls.length && parent && names.has(parent) ? [artUrl(parent)] : urls;
}

export async function loadEntryArt(kind: ArtEntryKind, key: string, parentKey?: string): Promise<string[]> {
  const [species, names] = await Promise.all([artSpecies(), availableArt()]);
  return presentEntryArt(kind, key, species, names, parentKey);
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

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

/** Weitere Szenen eines Monsters liegen im Ordner `monster-scenes/<slug>/` neben der ersten. */
const monsterScenes = (slug: string, names: Set<string>): string[] => {
  const first = `monster-scenes/${slug}`;
  const more = [...names]
    .filter((n) => n.startsWith(`${first}/`))
    .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  return [first, ...more];
};

/**
 * Ein Volk zeigt nur seine drei Grundfiguren, nicht die Figuren in Klasse oder Hintergrund.
 * `names` braucht nur das Monster: die Zahl seiner Szenen steht erst im Bildbestand.
 */
export function entryArtCandidates(
  kind: ArtEntryKind,
  key: string,
  species: { key: string; name: string }[],
  names: Set<string> = new Set(),
): ArtCandidateGroup[] {
  const slug = slugOf(key);
  if (kind === 'species') return [{ title: '', candidates: figures(slug, 'species') }];
  if (kind === 'monster') {
    const scenes = monsterScenes(slug, names).map((name, i) => ({ name, label: i ? `Szene ${i + 1}` : 'Szene' }));
    return [{ title: '', candidates: [...scenes, { name: `monsters/${slug}`, label: 'Symbol' }] }];
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
 * je Bild zu proben. Eine Unterklasse ohne eigene Figuren leiht sich das Bild ihrer Klasse; ein
 * Monster zeigt nur seine Szenen, nicht sein Symbol.
 */
export function presentEntryArt(
  kind: ArtEntryKind,
  key: string,
  species: { key: string; name: string }[],
  names: Set<string>,
  parentKey?: string,
): string[] {
  if (kind === 'monster') return monsterScenes(slugOf(key), names).filter((n) => names.has(n)).map(artUrl);
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

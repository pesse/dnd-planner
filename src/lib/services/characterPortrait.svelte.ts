/** Ohne eigenes Portrait zeigt der Charakter das Stimmungsbild seiner Klasse×Volk-Kombination. */
import type { Character } from '../schemas/characterSchema';
import { originArtCandidates, resolveOriginArt } from './wizard/originArt';
import { characterAssetSrc } from './characterSideFiles.svelte';

export const fallbackPortraitCandidates = (c: Character): string[] =>
  originArtCandidates('class', {
    classKey: c.classes[0]?.sourceKey ?? '',
    speciesKey: c.species.sourceKey,
    backgroundKey: '',
    presentation: c.presentation,
  });

/** Ein Bild für Listen, die nicht reaktiv nachladen: eigenes Portrait, sonst das Stimmungsbild. */
export async function resolveCharacterPortrait(c: Character, dirPath: string): Promise<string | null> {
  if (c.portraitFile) return (await characterAssetSrc(dirPath, c.portraitFile)) || null;
  return resolveOriginArt(fallbackPortraitCandidates(c));
}

export function createCharacterPortrait(deps: {
  character: () => Character | null | undefined;
  /** Asset-URL des hinterlegten Portraits; wird asynchron geladen. */
  ownUrl: () => string;
}): () => string {
  let fallback = $state('');

  const candidates = $derived.by(() => {
    const c = deps.character();
    if (!c || c.portraitFile) return [];
    return fallbackPortraitCandidates(c);
  });
  // Als String, damit nicht jede Bearbeitung am Charakter das Bild neu auflöst und flackert.
  const key = $derived(candidates.join('|'));

  $effect(() => {
    const list = key ? key.split('|') : [];
    fallback = '';
    let live = true;
    // Absolut, weil der Druck die URL in ein eigenes Dokument trägt.
    void resolveOriginArt(list).then((url) => {
      if (live && url) fallback = new URL(url, location.href).href;
    });
    return () => { live = false; };
  });

  // Nicht `ownUrl || fallback`: während das eigene Bild lädt, blitzte sonst das Stimmungsbild auf.
  return () => (deps.character()?.portraitFile ? deps.ownUrl() : fallback);
}

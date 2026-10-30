/**
 * Verdrahtung des „Neues Talent"-Dialogs (`CreateCardModal`). Liegt hier, weil zwei
 * Einstiege denselben Dialog öffnen: die Talent-Bibliothek in der Sidebar und der
 * Talent-Picker im Charakter-Editor.
 */
import { invoke } from '@tauri-apps/api/core';
import { FEAT_TEMPLATE, type Feat } from '$lib/types';
import { getFeats, searchFeats, featDisplayName } from '$lib/featsLibrary';
import { parseFeat } from '$lib/utils/schemaValidation';

/** Leerer Talent-Entwurf mit gegebenem Namen. */
export function blankFeat(name: string): Feat {
  return { ...structuredClone(FEAT_TEMPLATE), name: name || 'Neues Talent', nameDe: name || 'Neues Talent' };
}

/** Anzeigename eines Entwurfs (Platzhalter-Titel im Editor). */
export function featDraftName(f: Feat): string {
  return f.nameDe || f.name || 'Talent';
}

/** Bestehende Bibliotheks-Talente als Vorlage für ein neues. */
export async function searchFeatLibrary(q: string): Promise<{ name: string; load: () => Promise<Feat> }[]> {
  const lib = await getFeats();
  return searchFeats(lib, q, 8).map((f) => ({
    name: featDisplayName(f),
    load: async () => {
      if (!f.path) return blankFeat(featDisplayName(f));
      const r = parseFeat(JSON.parse(await invoke<string>('read_file_content', { path: f.path })));
      return r.ok ? r.data : blankFeat(featDisplayName(f));
    },
  }));
}

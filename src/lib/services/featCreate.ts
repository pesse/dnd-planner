/**
 * Verdrahtung des „Neues Talent"-Dialogs (`CreateCardModal`). Liegt hier, weil zwei
 * Einstiege denselben Dialog öffnen: die Talent-Bibliothek in der Sidebar und der
 * Talent-Picker im Charakter-Editor.
 */
import { invoke } from '@tauri-apps/api/core';
import { FEAT_TEMPLATE, type Feat } from '$lib/types';
import { getFeats, searchFeats, featDisplayName } from '$lib/featsLibrary';
import { parseFeat } from '$lib/utils/schemaValidation';
import { listFeats, getFeat as getFeatRaw } from './open5eClient';
import { mapV2Feat } from './featData';
import type { DndApiRef } from './dndApi';

/** Leerer Talent-Entwurf mit gegebenem Namen. */
export function blankFeat(name: string): Feat {
  return { ...structuredClone(FEAT_TEMPLATE), name: name || 'Neues Talent', nameDe: name || 'Neues Talent' };
}

/** Anzeigename eines Entwurfs (Platzhalter-Titel im Editor). */
export function featDraftName(f: Feat): string {
  return f.nameDe || f.name || 'Talent';
}

/** Open5e-v2-Talent-Suche. `ref.url` = v2-Key (kein dnd5eapi.co-Pfad). */
export async function searchOpen5eFeats(q: string): Promise<DndApiRef[]> {
  const all = await listFeats();
  const ql = q.toLowerCase();
  return all
    .filter((f) => f.name.toLowerCase().includes(ql))
    .map((f) => ({ index: f.key, name: f.name, url: f.key }))
    .slice(0, 15);
}

export const loadOpen5eFeat = async (ref: DndApiRef): Promise<Feat> => mapV2Feat(await getFeatRaw(ref.url));

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

/**
 * Wie eine Ansicht aussah, als man sie verließ: beim Verlassen eingesammelt, im Verlaufseintrag
 * aufbewahrt und bei Zurück/Vor der Ansicht wieder mitgegeben.
 */
import type { CardTab } from '../editor/cardEditor.svelte';
import type { EditSectionId } from './characterEditSections';
import type { CatalogFilters } from './catalog/catalogTypes';

export interface ViewStateMap {
  cardTab: CardTab;
  characterSection: EditSectionId;
  catalog: CatalogFilters;
  scroll: number;
}

export type ViewState = Partial<ViewStateMap>;
type Key = keyof ViewStateMap;

const sources = new Map<Key, () => unknown>();

/** Je Schlüssel gilt die zuletzt angemeldete Ansicht. Liefert die Abmeldung. */
export function registerViewState<K extends Key>(key: K, capture: () => ViewStateMap[K]): () => void {
  sources.set(key, capture);
  return () => {
    if (sources.get(key) === capture) sources.delete(key);
  };
}

export function captureViewState(): ViewState {
  return Object.fromEntries([...sources].map(([key, capture]) => [key, capture()])) as ViewState;
}

let arrival: { seq: number; state: ViewState } = { seq: 0, state: {} };

/** Nur echte Navigation ruft das — Umbenennen lädt neu, ist aber keine Ankunft. */
export function arrive(state: ViewState): void {
  arrival = { seq: arrival.seq + 1, state };
}

/**
 * Der mitgebrachte Zustand, einmal je Ankunft: `null` heißt „keine neue Ankunft, nichts
 * anfassen", `{ value: undefined }` eine frische Navigation ohne gespeicherten Zustand.
 */
export function arrivalReader<K extends Key>(key: K): () => { value: ViewStateMap[K] | undefined } | null {
  let seen = -1;
  return () => {
    if (seen === arrival.seq) return null;
    seen = arrival.seq;
    return { value: arrival.state[key] };
  };
}

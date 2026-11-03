/** Die Monster-Schublade des Cockpits: lebt im Detailpanel, damit Filter und Scrollposition einen Detailwechsel überstehen. */
import { getContext, setContext } from 'svelte';
import type { Monster } from '../../types';
import type { CatalogRow } from '../catalog/catalogTypes';

/** Der gerade offene Encounter, in den die Schublade wählt. */
export interface EncounterPickTarget {
  title: string;
  ownRows: CatalogRow[];
  count(slug: string): number;
  add(slug: string): void;
  remove(slug: string): void;
  monster(slug: string): Monster | undefined;
}

export class EncounterPicker {
  open = $state(false);
  built = $state(false);
  target = $state<EncounterPickTarget | null>(null);

  toggle(): void {
    this.open = !this.open;
    this.built = true;
  }
}

const KEY = Symbol('encounterPicker');
export const provideEncounterPicker = (): EncounterPicker => setContext(KEY, new EncounterPicker());
export const useEncounterPicker = (): EncounterPicker => getContext<EncounterPicker>(KEY);

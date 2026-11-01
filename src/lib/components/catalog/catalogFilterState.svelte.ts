/** Facetten, Suche und Sortierung einer Tabelle: aus dem Verlauf, sonst die zuletzt benutzten des Katalogs. */
import { onMount, untrack } from 'svelte';
import { arrivalReader, registerViewState } from '../../services/viewState';
import type { CatalogFilters, CatalogKind } from '../../services/catalog/catalogTypes';

const lastUsed = new Map<CatalogKind, CatalogFilters>();

export class CatalogFilterState {
  facets = $state<Record<string, string>>({});
  search = $state('');
  /** Überlebt den Gruppenwechsel, solange das neue Set die Spalte zeigt. */
  sortCol = $state('name');
  sortAsc = $state(true);

  #readArrival = arrivalReader('catalog');

  /** Die Getter müssen memoisiert sein: jede Navigation baut die Props des Elternteils neu. */
  constructor(kind: () => CatalogKind, group: () => string) {
    onMount(() => registerViewState('catalog', () => this.snapshot()));

    // Ohne mitgebrachten Zustand gilt die Sortierung eines anderen Katalogs nicht: sie passt nicht auf diese Spalten.
    $effect(() => {
      const k = kind();
      void group();
      untrack(() => {
        const arrived = this.#readArrival();
        if (arrived) this.#apply(arrived.value ?? lastUsed.get(k));
      });
    });

    $effect(() => {
      const current = this.snapshot();
      lastUsed.set(untrack(kind), current);
    });
  }

  snapshot(): CatalogFilters {
    return { facets: { ...this.facets }, search: this.search, sortCol: this.sortCol, sortAsc: this.sortAsc };
  }

  #apply(next: CatalogFilters | undefined) {
    this.sortCol = next?.sortCol ?? 'name';
    this.sortAsc = next?.sortAsc ?? true;
    this.search = next?.search ?? '';
    this.facets = { ...next?.facets };
  }

  /** `null` hebt die Facette auf — `''` ist ein echter Wert („Ohne Angabe"). */
  setFacet(id: string, value: string | null) {
    if (value === null) delete this.facets[id];
    else this.facets[id] = value;
  }

  /** `active` ist die tatsächlich angezeigte Sortierspalte, falls `sortCol` im Set fehlt. */
  sortBy(col: string, active: string) {
    if (active === col) this.sortAsc = !this.sortAsc;
    else {
      this.sortCol = col;
      this.sortAsc = true;
    }
  }
}

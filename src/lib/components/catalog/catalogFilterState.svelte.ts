/** Facetten, Suche und Sortierung einer Tabelle: aus dem Verlauf, sonst die zuletzt benutzten des Katalogs. */
import { onMount, untrack } from 'svelte';
import { arrivalReader, registerViewState } from '../../services/viewState';
import { CATALOGS } from '../../services/catalog/catalogs';
import type { CatalogFilters, CatalogKind, CatalogLayout } from '../../services/catalog/catalogTypes';

const lastUsed = new Map<CatalogKind, CatalogFilters>();

export class CatalogFilterState {
  facets = $state<Record<string, string[]>>({});
  search = $state('');
  /** Überlebt den Gruppenwechsel, solange das neue Set die Spalte zeigt. */
  sortCol = $state('name');
  sortAsc = $state(true);
  layout = $state<CatalogLayout>('table');

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
        if (arrived) this.#apply(arrived.value ?? lastUsed.get(k), CATALOGS[k].defaultLayout);
      });
    });

    $effect(() => {
      const current = this.snapshot();
      lastUsed.set(untrack(kind), current);
    });
  }

  snapshot(): CatalogFilters {
    return { facets: { ...this.facets }, search: this.search, sortCol: this.sortCol, sortAsc: this.sortAsc, layout: this.layout };
  }

  #apply(next: CatalogFilters | undefined, defaultLayout: CatalogLayout = 'table') {
    this.sortCol = next?.sortCol ?? 'name';
    this.sortAsc = next?.sortAsc ?? true;
    this.search = next?.search ?? '';
    this.facets = { ...next?.facets };
    this.layout = next?.layout ?? defaultLayout;
  }

  /** Leer hebt die Facette auf — `''` ist ein echter Wert („Ohne Angabe"). */
  setFacet(id: string, values: string[]) {
    if (!values.length) delete this.facets[id];
    else this.facets[id] = values;
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

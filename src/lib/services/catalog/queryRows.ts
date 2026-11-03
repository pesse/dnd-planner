import { facetValues, type CatalogFilters, type CatalogRow } from './catalogTypes';

/** `sortCol` ist die tatsächlich angezeigte Spalte — die gemerkte fehlt womöglich im Set. */
export function queryRows(rows: CatalogRow[], filters: Pick<CatalogFilters, 'facets' | 'search' | 'sortAsc'>, sortCol: string): CatalogRow[] {
  const q = filters.search.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    Object.entries(filters.facets).every(([id, chosen]) => facetValues(r, id).some((v) => chosen.includes(v.id)))
    && (!q || r.name.toLowerCase().includes(q) || !!r.altName?.toLowerCase().includes(q)));
  const key = (r: CatalogRow): string | number =>
    sortCol === 'name' ? r.name : (r.cells[sortCol].sort ?? r.cells[sortCol].text);
  const dir = filters.sortAsc ? 1 : -1;
  return filtered.sort((a, b) => {
    const ka = key(a), kb = key(b);
    const c = typeof ka === 'number' && typeof kb === 'number'
      ? ka - kb
      : String(ka).localeCompare(String(kb), 'de');
    return c * dir || a.name.localeCompare(b.name, 'de');
  });
}

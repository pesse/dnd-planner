/** Tabellen-Übersicht einer Bibliothek: Zeilen, Spalten und der Gruppenfilter aus der Seitenleiste. */
import type { FileEntry } from '../../types';
import { sourceLabel } from '../../schemas/source';

export const CATALOG_KINDS = ['monster', 'item', 'feat'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export interface CatalogCell {
  text: string;
  /** Fehlt er, sortiert die Spalte nach `text`. */
  sort?: string | number;
  color?: string;
}

export interface CatalogColumn {
  label: string;
  numeric?: boolean;
  /** Für Symbol-Spalten (Haken). */
  center?: boolean;
  /** Lange Werte (Eigenschaftslisten) dürfen umbrechen. */
  wrap?: boolean;
}

export interface CatalogRow {
  path: string;
  /** Name des Eintrags in `activeFile` (Dateiname ohne Endung). */
  entryName: string;
  name: string;
  /** Englischer Name o.ä., den die Suche zusätzlich trifft. */
  altName?: string;
  group: string;
  icon: string | null;
  iconColor: string;
  /** Alle Spalten des Katalogs, auch die das aktuelle Set nicht zeigt. */
  cells: Record<string, CatalogCell>;
  /** Ein Wert je `CatalogSpec.facets`; ohne Wert bleibt die Zeile bei gesetztem Filter draußen. */
  facets: Record<string, CatalogFacetValue | undefined>;
}

export interface CatalogFacetValue {
  id: string;
  label: string;
  /** Fehlt sie, ordnet das Label. */
  order?: number;
}

export interface CatalogGroup {
  id: string;
  label: string;
}

export interface CatalogSpec {
  kind: CatalogKind;
  type: FileEntry['type'];
  label: string;
  /** Benennt den Gruppenfilter („Typ", „Kategorie"). */
  groupLabel: string;
  columns: Record<string, CatalogColumn>;
  /** `''` ist das Set ohne Filter und zugleich der Fallback jeder Gruppe ohne eigenes. */
  columnSets: { '': string[] } & Record<string, string[]>;
  /** Zusatzfilter neben der Gruppe: id → Label. */
  facets: Record<string, string>;
  load: () => Promise<{ rows: CatalogRow[]; groups: CatalogGroup[] }>;
  invalidate: () => void;
}

export const byLabel = (a: CatalogGroup, b: CatalogGroup) => a.label.localeCompare(b.label, 'de');

export const sourceFacet = (source: string | undefined): CatalogFacetValue =>
  ({ id: source ?? '', label: sourceLabel(source) || 'Ohne Angabe' });

/** Die Werte einer Facette über `rows`, in Anzeige-Reihenfolge. */
export function facetOptions(rows: CatalogRow[], facet: string): CatalogFacetValue[] {
  const byId = new Map<string, CatalogFacetValue>();
  for (const row of rows) {
    const value = row.facets[facet];
    if (value) byId.set(value.id, value);
  }
  return [...byId.values()].sort((a, b) =>
    (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, 'de'));
}

export function columnsFor(spec: CatalogSpec, group: string): string[] {
  return spec.columnSets[group] ?? spec.columnSets[''];
}

const PREFIX = 'catalog:';

/** Der Filter steckt im Pfad, damit Zurück/Vor zwischen zwei Filtern unterscheidet. */
export function catalogEntry(kind: CatalogKind, label: string, group?: CatalogGroup): FileEntry {
  return {
    type: 'catalog',
    name: group ? `${label} · ${group.label}` : label,
    path: `${PREFIX}${kind}${group ? `/${group.id}` : ''}`,
  };
}

export function parseCatalogPath(path: string): { kind: CatalogKind; group: string } | null {
  if (!path.startsWith(PREFIX)) return null;
  const [kind, group = ''] = path.slice(PREFIX.length).split('/');
  return (CATALOG_KINDS as readonly string[]).includes(kind) ? { kind: kind as CatalogKind, group } : null;
}

/** Tabellen-Übersicht einer Bibliothek: Zeilen, Spalten und der Gruppenfilter aus der Seitenleiste. */
import type { FileEntry } from '../../types';
import { sourceLabel } from '../../schemas/source';

export type CatalogKind = 'monster' | 'item';

export interface CatalogCell {
  text: string;
  /** Fehlt er, sortiert die Spalte nach `text`. */
  sort?: string | number;
  color?: string;
}

export interface CatalogColumn {
  label: string;
  numeric?: boolean;
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
  load: () => Promise<{ rows: CatalogRow[]; groups: CatalogGroup[] }>;
  invalidate: () => void;
}

export const byLabel = (a: CatalogGroup, b: CatalogGroup) => a.label.localeCompare(b.label, 'de');

export const sourceCell = (source: string | undefined): CatalogCell => ({ text: sourceLabel(source) || '—' });

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
  return kind === 'monster' || kind === 'item' ? { kind, group } : null;
}

/**
 * Die Herkünfte, die installierte Packs deklarieren. Gelesen zur Laufzeit, damit ein neues Buch
 * nur einen Pack braucht und keine App-Version.
 */
import { scanJsonFolder } from './library/createLibrary';
import { memoOnce } from './library/memo';
import { sourceDeclarationSchema, type SourceDeclaration } from '../schemas/sourceDeclaration';
import { SOURCE_KEYS, SOURCE_LABELS, staticSourceLabel, type SourceKey } from '../schemas/source';

export const SOURCES_PATH = './vault/sources';

// Beschriftungen werden synchron gebraucht (Karten, Filter); bis zum ersten Laden zeigt eine
// deklarierte Herkunft ihr Kürzel.
let labels = new Map<string, string>();
let includedBy = new Map<string, string[]>();

const declarations = memoOnce(async (): Promise<SourceDeclaration[]> => {
  const all: (SourceDeclaration | null)[] = await scanJsonFolder<SourceDeclaration | null>(
    SOURCES_PATH,
    (raw) => sourceDeclarationSchema.parse(raw),
    () => null,
  ).catch(() => []);
  const valid = all.filter((d): d is SourceDeclaration => d !== null);
  labels = new Map(valid.map((d) => [d.source, d.label]));
  includedBy = new Map();
  for (const d of valid) {
    for (const key of [...d.includes.monsters, ...d.includes.items]) {
      includedBy.set(key, [...(includedBy.get(key) ?? []), d.source]);
    }
  }
  return valid;
});

export const getSourceDeclarations = declarations.get;

export function invalidateSourceDeclarations(): void {
  declarations.invalidate();
  void declarations.get();
}

/** Die Herkünfte, deren Buch den Eintrag `key` aus einer anderen Herkunft verwendet. */
export function includingSources(key: string | undefined): string[] {
  return (key && includedBy.get(key)) || [];
}

export function sourceLabel(source: string | undefined): string {
  return (source && !(source in SOURCE_LABELS) && labels.get(source)) || staticSourceLabel(source);
}

/** Für Auswahllisten: feste Herkünfte, dann die deklarierten, dann `current`, falls fremd. */
export function selectableSources(current?: string): { key: SourceKey; label: string }[] {
  const keys = [...new Set<string>([...SOURCE_KEYS, ...labels.keys(), ...(current ? [current] : [])])];
  return keys.map((key) => ({ key, label: sourceLabel(key) }));
}

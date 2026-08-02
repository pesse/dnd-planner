/**
 * Karten-Editor einer flach abgelegten Regelbibliothek (`vault/<folder>/<name>.json`).
 * Gemeinsam sind Ablage, Dateiname und das Nachziehen von Bibliotheks- und Vault-Cache.
 */
import { createCardEditor, type CardEditor } from '$lib/editor/cardEditor.svelte';
import { jsonParser, type ParseResult } from '$lib/utils/schemaValidation';
import { slugKeepUmlauts } from '$lib/utils/text';
import { invalidateVault } from '$lib/stores/campaign';
import type { FileEntry } from '$lib/types';

interface LibraryCardConfig<T> {
  type: FileEntry['type'];
  /** Deutsch, für Fehlermeldungen des Editors. */
  label: string;
  folder: string;
  validate: (raw: unknown) => ParseResult<T>;
  /** Dateiname, wenn der Datensatz gar keinen Namen trägt. */
  fallbackName: string;
  /** Default: deutscher Name vor englischem. */
  defaultName?: (draft: T) => string;
  invalidateCache: () => void;
}

export function createLibraryCardEditor<T extends { name?: string; nameDe?: string }>(
  cfg: LibraryCardConfig<T>,
): CardEditor<T> {
  return createCardEditor<T>({
    type: cfg.type,
    label: cfg.label,
    parse: jsonParser(cfg.validate),
    defaultName: cfg.defaultName ?? ((d) => slugKeepUmlauts(d.nameDe || d.name || cfg.fallbackName)),
    location: {
      resolvePath: (_d, name) => `./vault/${cfg.folder}/${name}.json`,
    },
    onSaved: () => { cfg.invalidateCache(); invalidateVault(); },
  });
}

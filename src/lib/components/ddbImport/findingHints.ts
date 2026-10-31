/** Hinweistexte und Voreinstellungen je Befund — aus Buchquelle, Homebrew-Flag und Art. */
import type { ImportFinding, Resolution, ResolutionAction } from '../../services/ddbImport/findings';
import { bookLabel, suggestedImportSource, type DdbSourceCatalog } from '../../services/ddbImport/sources';
import { OWN_SOURCE, type SourceKey } from '../../schemas/source';

export const ACTION_LABELS: Record<ResolutionAction, string> = {
  link: 'Mit Bibliothek verknüpfen',
  create: 'Im Vault anlegen',
  freetext: 'Als Freitext behalten',
  drop: 'Weglassen',
};

export const KIND_LABELS: Record<ImportFinding['kind'], string> = {
  class: 'Klasse', subclass: 'Unterklasse', species: 'Volk', background: 'Hintergrund',
  feat: 'Talent', item: 'Gegenstand', spell: 'Zauber',
};

export interface FindingHint {
  tone: 'info' | 'warn';
  text: string;
}

export function findingHints(f: ImportFinding, catalog: DdbSourceCatalog): FindingHint[] {
  const out: FindingHint[] = [];
  const sourceId = f.origin?.sourceId ?? null;
  const book = sourceId === null ? undefined : catalog.get(sourceId);
  if (f.reason === 'ambiguous') {
    out.push({ tone: 'warn', text: 'Mehrere Bibliothekseinträge tragen diesen Namen — bitte den richtigen wählen.' });
  }
  if (f.origin?.homebrew) {
    out.push({ tone: 'info', text: 'Homebrew aus D&D Beyond. Anlegen speichert ihn als eigenes Material („Eigen").' });
  } else if (book?.legacy) {
    out.push({ tone: 'warn', text: `Regeln von 2014 (${book.title}). Die Bibliothek führt die Fassung von 2024 — am besten mit dem neuen Gegenstück verknüpfen.` });
  } else if (book?.core2024) {
    out.push({ tone: 'info', text: `Aus „${book.title}", fehlt aber in der Bibliothek — vermutlich ist das passende Inhaltspaket nicht installiert.` });
  } else if (sourceId !== null) {
    out.push({
      tone: 'info',
      text: `Aus „${bookLabel(catalog, sourceId)}", das die Bibliothek nicht kennt. Angelegt landet der Eintrag nur in deinem Vault und wird nie in ein Inhaltspaket übernommen.`,
    });
  }
  return out;
}

export function defaultCreateSource(f: ImportFinding, catalog: DdbSourceCatalog): SourceKey {
  return f.origin?.homebrew || f.origin?.sourceId == null ? OWN_SOURCE : suggestedImportSource(catalog, f.origin.sourceId);
}

/** Mehrdeutiges ist mit dem ersten Kandidaten vorbelegt, alles andere bleibt Freitext. */
export function defaultResolution(f: ImportFinding): Resolution {
  return f.candidates[0] ? { action: 'link', key: f.candidates[0].key } : { action: 'freetext' };
}

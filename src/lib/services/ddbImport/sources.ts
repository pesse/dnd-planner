/** Quellenkatalog von D&D Beyond: Buch-ID → Kürzel und Titel, für die Hinweise des Wizards. */
import { z } from 'zod';
import { importSourceFromTitle, isImportSource, OWN_SOURCE, type SourceKey } from '$lib/schemas/source';
import type { SourceDeclaration } from '$lib/schemas/sourceDeclaration';
import { httpFetch } from '../httpFetch';
import { htmlText } from './htmlText';

export const DDB_CONFIG_URL = 'https://www.dndbeyond.com/api/config/json';

/** „5e Core Rules", „5e Expanded Rules", „Legacy/Noncore" — Regeln von 2014. */
const LEGACY_CATEGORIES = new Set([1, 23, 26]);
/** „5.5e Core Rules" — SRD 5.2 / PHB 2024, das deckt die Bibliothek ab. */
const CORE_2024_CATEGORY = 24;

const configSchema = z.object({
  sources: z.array(z.object({
    id: z.number(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    sourceCategoryId: z.number().nullish(),
  })).nullish().transform((x) => x ?? []),
});
export type DdbConfig = z.input<typeof configSchema>;

export interface DdbSourceBook {
  id: number;
  code: string;
  title: string;
  legacy: boolean;
  core2024: boolean;
  /** Ein installierter Pack führt dieses Buch. */
  declared?: SourceDeclaration;
}

export type DdbSourceCatalog = Map<number, DdbSourceBook>;

export function buildSourceCatalog(raw: unknown): DdbSourceCatalog {
  const parsed = configSchema.safeParse(raw);
  const out: DdbSourceCatalog = new Map();
  for (const s of parsed.success ? parsed.data.sources : []) {
    const category = s.sourceCategoryId ?? 0;
    out.set(s.id, {
      id: s.id,
      code: s.name ?? '',
      title: htmlText(s.description) || s.name || `Quelle ${s.id}`,
      legacy: LEGACY_CATEGORIES.has(category),
      core2024: category === CORE_2024_CATEGORY,
    });
  }
  return out;
}

let cached: Promise<DdbSourceCatalog> | null = null;

/** Ohne Katalog läuft der Import weiter — die Hinweise nennen dann nur die Quellen-ID. */
export function loadSourceCatalog(): Promise<DdbSourceCatalog> {
  cached ??= httpFetch(DDB_CONFIG_URL, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then(buildSourceCatalog)
    .catch((err) => {
      console.warn('D&D-Beyond-Quellenkatalog nicht ladbar:', err);
      cached = null;
      return new Map();
    });
  return cached;
}

export function bookLabel(catalog: DdbSourceCatalog, sourceId: number | null): string {
  if (sourceId === null) return '';
  const book = catalog.get(sourceId);
  return book ? book.title : `D&D-Beyond-Quelle ${sourceId}`;
}

/** Auch ohne erreichbaren Katalog kennt der Import die Bücher, die ein Pack deklariert. */
export function withDeclarations(catalog: DdbSourceCatalog, declarations: SourceDeclaration[]): DdbSourceCatalog {
  const out: DdbSourceCatalog = new Map(catalog);
  for (const declared of declarations) {
    for (const id of declared.ddbSourceIds) {
      const book = out.get(id) ?? { id, code: '', title: declared.title, legacy: false, core2024: false };
      out.set(id, { ...book, declared });
    }
  }
  return out;
}

/** Das Buch eines installierten Packs behält dessen Herkunft — sonst wird es ein lokaler Import. */
export function suggestedSource(catalog: DdbSourceCatalog, sourceId: number | null): SourceKey {
  const book = sourceId === null ? undefined : catalog.get(sourceId);
  return book?.declared?.source ?? importSourceFromTitle(book?.title || book?.code || 'dndbeyond');
}

export function isCreatableSource(catalog: DdbSourceCatalog, source: string): boolean {
  return source === OWN_SOURCE || isImportSource(source) || [...catalog.values()].some((b) => b.declared?.source === source);
}

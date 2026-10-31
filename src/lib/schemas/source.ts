/**
 * Herkunft eines Bibliotheks-Artefakts. Der Wert steuert, in welchen verteilbaren Pack
 * eine Datei fällt (vault/libraries.yaml, fail-closed), ist der `document.key` der
 * Open5e-Artefakte und das Präfix jedes Main-Keys — ein anderer bricht den Pack-Build ab.
 */
import { z } from 'zod';

export const SOURCE_KEYS = [
  'srd-2024',
  'phb-2024',
  'efa-2025',
  'mm-2024',
  'dmg-2024',
  // Stranger Things: Welcome to the Hellfire Club (Abenteuer)
  'hellfire-club',
  'homebrew-sam',
  // Fremd-/Legacy-Herkünfte: Zauber, die Open5e-2024 nicht führt. `dndapi-2014` ist
  // Altbestand aus dem früheren dnd5eapi-Import, `deepm` Kobold Press, `a5e-ag` Level Up.
  'dndapi-2014',
  'srd-2014',
  'deepm',
  'a5e-ag',
] as const;
type FixedSourceKey = (typeof SOURCE_KEYS)[number];

/**
 * Aus einem gekauften Buch importiert (D&D Beyond), z. B. `crooked-moon-import`. Liegt nur im
 * lokalen Vault: `build_packs.py` überspringt die ganze Familie, sie wird nie gepackt.
 */
export type ImportSourceKey = `${string}-import`;
export type SourceKey = FixedSourceKey | ImportSourceKey;

export const IMPORT_SOURCE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-import$/;
export const isImportSource = (s: string): s is ImportSourceKey => IMPORT_SOURCE_RE.test(s);

const TITLE_FILLER = new Set(['the', 'a', 'an', 'of', 'and', 'part', 'one', 'two', 'three']);

/** „The Crooked Moon Part One: Player Options…" → `crooked-moon-import`. */
export function importSourceFromTitle(title: string): ImportSourceKey {
  const words = title.toLowerCase().split(/[:(]/)[0]
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((w) => w && !TITLE_FILLER.has(w));
  return `${words.slice(0, 3).join('-') || 'buch'}-import`;
}

/** Default für alles, was in der App neu entsteht. */
export const OWN_SOURCE: SourceKey = 'homebrew-sam';

export const SOURCE_LABELS: Record<FixedSourceKey, string> = {
  'srd-2024': 'SRD 5.2',
  'phb-2024': 'PHB 2024',
  'efa-2025': 'Eberron 2025',
  'mm-2024': 'MM 2024',
  'dmg-2024': 'DMG 2024',
  'hellfire-club': 'Hellfire Club',
  'homebrew-sam': 'Eigen',
  'dndapi-2014': 'D&D API 2014',
  'srd-2014': 'SRD 5.1',
  deepm: 'Deep Magic',
  'a5e-ag': 'Level Up A5E',
};

/** Unbekannte Werte (Fremdimport) unverändert durchreichen. */
export function sourceLabel(source: string | undefined): string {
  if (source && isImportSource(source)) {
    const name = source.slice(0, -'-import'.length).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return `${name} (Import)`;
  }
  return SOURCE_LABELS[source as FixedSourceKey] ?? source ?? '';
}

/**
 * Geschlossen statt Freitext: ein falsch gepflegter Editor fällt im Parse-Gate auf statt erst
 * im Pack-Build. Erfindet ein LLM eine `*-import`-Herkunft, landet sie nur nie im Pack — die
 * sichere Richtung. Altbestand fängt `migrateSourceLegacy` ab, das vor jedem Parse läuft.
 */
export const sourceField = () =>
  z.union([z.enum(SOURCE_KEYS), z.string().regex(IMPORT_SOURCE_RE) as unknown as z.ZodType<ImportSourceKey>])
    .default(OWN_SOURCE).describe('Herkunft: SRD 5.2, PHB 2024 oder eigenes Material.');

// Altbestand: `source` führte eine eigene, uneinheitliche Liste neben `document.key`.
const LEGACY_SOURCES: Record<string, SourceKey> = {
  SRD: 'srd-2024',
  'PHB-2024 (kein SRD)': 'phb-2024',
  eigen: 'homebrew-sam',
  KI: 'homebrew-sam',
  Homebrew: 'homebrew-sam',
  homebrew: 'homebrew-sam',
};

/**
 * Unbekanntes fällt auf `OWN_SOURCE`: die sichere Richtung, weil dieser Pack codiert
 * ist und das Material so nie ungeprüft in einer offenen Library landet.
 */
export function toSourceKey(raw: string | undefined | null): SourceKey {
  const s = raw ?? '';
  if (LEGACY_SOURCES[s]) return LEGACY_SOURCES[s];
  if (isImportSource(s)) return s;
  return (SOURCE_KEYS as readonly string[]).includes(s) ? (s as SourceKey) : OWN_SOURCE;
}

/** Fehlt `source` ganz, springt `document.key` ein; sonst gilt der Default. */
export function migrateSourceLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  const doc = raw.document as { key?: unknown } | undefined;
  const current =
    typeof raw.source === 'string' && raw.source
      ? raw.source
      : typeof doc?.key === 'string'
        ? doc.key
        : '';
  const next = toSourceKey(current);

  raw.source = next;
  // `document.key` ist dasselbe Merkmal in zweiter Ausfertigung — mitziehen,
  // sonst weist der Pack-Build die Datei wegen Widerspruchs ab.
  if (doc && typeof doc === 'object' && doc.key) (doc as { key: string }).key = next;
  return raw;
}

/** Legacy-Main-Keys mitziehen: "homebrew_alarm" → "homebrew-sam_alarm". */
export function migrateSourceKey(key: string | undefined): string {
  return key?.startsWith('homebrew_') ? `${OWN_SOURCE}_${key.slice('homebrew_'.length)}` : (key ?? '');
}

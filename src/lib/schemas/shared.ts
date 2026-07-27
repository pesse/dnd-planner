/**
 * Gemeinsame Bausteine für die Entity-Schemas (Single Source of Truth).
 *
 * Pro Entität gibt es genau EIN Zod-Schema. Daraus werden drei Sichten abgeleitet:
 *   1) TS-Type            → `z.infer<typeof schema>`
 *   2) Runtime-Validator  → `schema.safeParse()` (nachsichtig: füllt Defaults, strippt
 *                            Unbekanntes — siehe schemaValidation.ts)
 *   3) LLM-JSON-Schema     → `toLlmJsonSchema(schema)` (strikt: vollständiger Output)
 */
import { z } from 'zod';

/**
 * `{ index, name }`-Referenzobjekt (Schadenstyp, Equipment-Kategorie, …).
 *
 * Bewusst eine Factory (frische Instanz pro Aufruf), damit `z.toJSONSchema`
 * die Definition INLINE ausgibt statt sie über `$ref`/`$defs` zu deduplizieren —
 * Anthropics Structured-Outputs erwartet das aufgelöste Schema.
 */
export const namedRef = (desc?: string) => {
  const s = z.object({ index: z.string(), name: z.string() });
  return desc ? s.describe(desc) : s;
};

// ── Herkunft ──────────────────────────────────────────────────────────────────
//
// Genau drei Werte, siehe vault/CLAUDE.md. Sie steuern, in welchen verteilbaren
// Pack eine Datei fällt (vault/libraries.yaml, fail-closed), sind der
// `document.key` der Open5e-Artefakte und zugleich das Präfix jedes Main-Keys
// ("srd-2024_alert", "homebrew-sam_runenhammer"). Ein anderer Wert lässt den
// Pack-Build abbrechen.

export const SOURCE_KEYS = ['srd-2024', 'phb-2024', 'homebrew-sam'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Default für alles, was in der App neu entsteht. */
export const OWN_SOURCE: SourceKey = 'homebrew-sam';

export const SOURCE_LABELS: Record<SourceKey, string> = {
  'srd-2024': 'SRD 5.2',
  'phb-2024': 'PHB 2024',
  'homebrew-sam': 'Eigen',
};

/** Anzeigename einer Herkunft; unbekannte Werte (Fremdimport) unverändert durchreichen. */
export function sourceLabel(source: string | undefined): string {
  return SOURCE_LABELS[source as SourceKey] ?? source ?? '';
}

/**
 * Das `source`-Feld für ein Entity-Schema.
 *
 * Bewusst `z.enum` statt Freitext: so kann ein LLM gar keinen erfundenen Wert
 * liefern, und ein falsch gepflegter Editor fällt schon im Parse-Gate auf statt
 * erst im Pack-Build. Altbestand fängt `migrateSourceLegacy` ab, das vor jedem
 * Parse läuft.
 */
export const sourceField = () =>
  z.enum(SOURCE_KEYS).default(OWN_SOURCE).describe('Herkunft: SRD 5.2, PHB 2024 oder eigenes Material.');

// Bis Juli 2026 gültige Herkunftsangaben. `document.key` trug schon die neuen
// Werte, `source` eine eigene, uneinheitliche Liste.
const LEGACY_SOURCES: Record<string, SourceKey> = {
  SRD: 'srd-2024',
  'PHB-2024 (kein SRD)': 'phb-2024',
  eigen: 'homebrew-sam',
  KI: 'homebrew-sam',
  Homebrew: 'homebrew-sam',
  homebrew: 'homebrew-sam',
};

/**
 * Beliebige Herkunftsangabe → einer der drei gültigen Werte.
 *
 * Unbekanntes (leer, Fremdimport, Open5e-Dokumente außerhalb SRD 5.2 wie
 * `srd-2014`) fällt auf `homebrew-sam`. Das ist die sichere Richtung: der Pack
 * ist codiert, das Material landet also nie ungeprüft in einer offenen Library.
 */
export function toSourceKey(raw: string | undefined | null): SourceKey {
  const s = raw ?? '';
  if (LEGACY_SOURCES[s]) return LEGACY_SOURCES[s];
  return (SOURCE_KEYS as readonly string[]).includes(s) ? (s as SourceKey) : OWN_SOURCE;
}

/**
 * Bringt die Herkunft eines eingelesenen Artefakts auf das aktuelle Vokabular.
 * Fehlt `source` ganz, springt `document.key` ein (Open5e-Artefakte trugen die
 * Herkunft früher nur dort); sonst gilt der Default.
 */
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

// ── Serialisierung in den Vault ───────────────────────────────────────────────
//
// Die Herkunft hängt nicht am Artefakt, sondern an seinem Ablageort:
//
//   akt-lokal (campaigns/*/acts/*/monsters/)  → KEIN `source`
//   Bibliothek (vault/monsters/, spells/, …)  → genau ein gültiger `source`
//
// Akt-lokales Material wird nie als Bibliothek verteilt, sondern nur mit seiner
// Kampagne — die Herkunftsfrage stellt sich dort nicht. Erst die Übernahme in
// die Bibliothek vergibt eine. Siehe vault/CLAUDE.md.

/** Akt-lokales Artefakt: ohne Herkunft ablegen. */
export function toActLocalJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  delete obj.source;
  return JSON.stringify(obj, null, 2);
}

/**
 * Bibliotheks-Artefakt: mit gültiger Herkunft ablegen.
 *
 * Setzt `source` an Ort und Stelle (Feldreihenfolge bleibt erhalten) und
 * normalisiert dabei Altwerte. Wer eine bestimmte Herkunft erzwingen will —
 * etwa die Übernahme aus einem Akt — übergibt sie mitsamt dem Artefakt.
 */
export function toLibraryJson(entity: unknown): string {
  const obj = { ...(entity as Record<string, unknown>) };
  obj.source = toSourceKey(obj.source as string);
  return JSON.stringify(obj, null, 2);
}

/** Legacy-Main-Keys mitziehen: "homebrew_alarm" → "homebrew-sam_alarm". */
export function migrateSourceKey(key: string | undefined): string {
  return key?.startsWith('homebrew_') ? `${OWN_SOURCE}_${key.slice('homebrew_'.length)}` : (key ?? '');
}

/**
 * Wandelt ein Zod-Schema in das JSON-Schema um, das Anthropics
 * `output_config.format.json_schema` erwartet.
 *
 * - `io: 'output'` → Felder mit `.default()` gelten als immer vorhanden (required),
 *   genau das gewünschte „strikte, vollständige" LLM-Ergebnis.
 * - `sanitize` erzwingt `additionalProperties: false` auf allen Objekten MIT
 *   `properties` (Records mit Schema-`additionalProperties` bleiben unangetastet)
 *   und entfernt JSON-Schema-Meta (`$schema`), das die API nicht braucht.
 */
export function toLlmJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output', unrepresentable: 'any' });
  return sanitize(json) as Record<string, unknown>;
}

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    delete obj['$schema'];
    for (const key of Object.keys(obj)) obj[key] = sanitize(obj[key]);
    collapseNullableAnyOf(obj);
    if (obj.type === 'object' && obj.properties && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }
    return obj;
  }
  return node;
}

/**
 * Zod gibt `.nullable()` ggf. als `{ anyOf: [<schema>, { type: 'null' }] }` aus.
 * Anthropics Structured-Outputs erwartet die kompakte Form `{ type: [<t>, 'null'] }`
 * — bei einfachem Basistyp dorthin zusammenfalten.
 */
function collapseNullableAnyOf(obj: Record<string, unknown>): void {
  const anyOf = obj.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) return;
  const nullIdx = anyOf.findIndex((s) => s && typeof s === 'object' && (s as Record<string, unknown>).type === 'null');
  if (nullIdx === -1) return;
  const other = anyOf[1 - nullIdx] as Record<string, unknown> | undefined;
  if (!other || typeof other.type !== 'string') return;
  delete obj.anyOf;
  obj.type = [other.type, 'null'];
  for (const [k, v] of Object.entries(other)) {
    if (k !== 'type' && obj[k] === undefined) obj[k] = v;
  }
}

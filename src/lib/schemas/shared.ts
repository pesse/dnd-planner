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

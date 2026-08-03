/**
 * Die dritte Sicht auf ein Zod-Schema: das JSON-Schema, das Anthropics
 * Structured-Outputs erwartet. `namedRef` steht hier, weil sein Grund genau das ist.
 */
import { z } from 'zod';

/**
 * Bewusst eine Factory (frische Instanz pro Aufruf), damit `z.toJSONSchema` die
 * Definition INLINE ausgibt statt sie über `$ref`/`$defs` zu deduplizieren —
 * Anthropics Structured-Outputs erwartet das aufgelöste Schema.
 */
export const namedRef = (desc?: string) => {
  const s = z.object({ index: z.string(), name: z.string() });
  return desc ? s.describe(desc) : s;
};

/**
 * `io: 'output'` → Felder mit `.default()` gelten als required, also als „strikt und
 * vollständig". `sanitize` erzwingt `additionalProperties: false` auf Objekten MIT
 * `properties` (Records bleiben unangetastet) und entfernt Meta, das die API nicht braucht.
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

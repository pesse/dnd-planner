/**
 * Was `toLlmJsonSchema` gegenüber `z.toJSONSchema` ändert — die Form, die Anthropics
 * Structured-Outputs annimmt.
 *
 *   npm run test -- llmJsonSchema
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toLlmJsonSchema } from '../../src/lib/schemas/llmJson';
import { equipmentOptionsJsonSchema } from '../../src/lib/schemas/wizardEquipment';

const walk = (node: unknown, hit: (obj: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, hit));
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  hit(obj);
  Object.values(obj).forEach((v) => walk(v, hit));
};

const rangeKeys = (schema: unknown): string[] => {
  const found: string[] = [];
  walk(schema, (obj) => {
    const type = obj.type;
    const isInteger = type === 'integer' || (Array.isArray(type) && type.includes('integer'));
    if (!isInteger) return;
    for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'])
      if (obj[k] !== undefined) found.push(k);
  });
  return found;
};

describe('toLlmJsonSchema', () => {
  it('lässt keine Schranke an einem integer stehen', () => {
    const schema = toLlmJsonSchema(
      z.object({ count: z.number().int().min(1).max(9), gold: z.number().int().min(0) }),
    );
    expect(rangeKeys(schema)).toEqual([]);
    expect((schema.properties as Record<string, { type: string }>).count.type).toBe('integer');
  });

  it('räumt die Schranke auch unter `.nullable()` ab', () => {
    const schema = toLlmJsonSchema(z.object({ count: z.number().int().min(1).nullable() }));
    expect(rangeKeys(schema)).toEqual([]);
  });

  it('lässt die Schranke an einer Fließkommazahl stehen', () => {
    const schema = toLlmJsonSchema(z.object({ weight: z.number().min(0) }));
    const weight = (schema.properties as Record<string, Record<string, unknown>>).weight;
    expect(weight.minimum).toBe(0);
  });

  it('gibt die Startausrüstung ohne Schranke aus', () => {
    expect(rangeKeys(equipmentOptionsJsonSchema)).toEqual([]);
  });
});

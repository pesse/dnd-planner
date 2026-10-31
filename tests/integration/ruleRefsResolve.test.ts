/**
 * Jeder `rule:`-Verweis des ECHTEN Vaults muss einen Regelbegriff treffen, und jeder Regelbegriff
 * muss das Schema erfüllen. Gesetzt werden die Verweise von `scripts/link-rule-refs.mts`.
 *
 *   npm run test -- ruleRefsResolve
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULE_REF_SCHEME } from '../../src/lib/services/vaultLinks';
import { ruleSchema } from '../../src/lib/schemas/rule';

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) jsonFiles(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

const ruleFiles = jsonFiles('vault/rules').map((file) => ({ file, raw: JSON.parse(readFileSync(file, 'utf8')) as unknown }));
const ruleKeys = new Set(ruleFiles.map((r) => (r.raw as { key?: string }).key).filter((k): k is string => !!k));

const refs = ['vault/items', 'vault/classes', 'vault/species', 'vault/feats', 'vault/backgrounds', 'vault/rules']
  .flatMap((root) => jsonFiles(root))
  .flatMap((file) => {
    const matches = readFileSync(file, 'utf8').matchAll(new RegExp(`\\]\\(${RULE_REF_SCHEME}([^)]+)\\)`, 'g'));
    return [...matches].map((m) => ({ file, key: m[1] }));
  });

describe('Regelbegriffe im Vault', () => {
  it('erfüllt jede Datei das Schema', () => {
    const broken = ruleFiles.filter((r) => !ruleSchema.safeParse(r.raw).success).map((r) => r.file);
    expect(ruleFiles.length).toBeGreaterThan(150);
    expect(broken).toEqual([]);
  });

  it('löst jeden Verweis-Key auf', () => {
    expect(refs.length).toBeGreaterThan(1000);
    expect(refs.filter((r) => !ruleKeys.has(r.key))).toEqual([]);
  });
});

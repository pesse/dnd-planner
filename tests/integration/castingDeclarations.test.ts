/**
 * Der Bestand an `grantsCasting` im ECHTEN Vault: Fremdverweise, Zweig-Bedingungen und
 * Tabellennamen müssen treffen, und die Beispiele aus `docs/plan/zauberquellen-beispiele.json`
 * müssen mit dem Vault übereinstimmen.
 *
 *   npm run test -- castingDeclarations
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getClasses } from '../../src/lib/classLibrary';
import { getFeats } from '../../src/lib/featsLibrary';
import { castingGrantSchema, type CastingGrant, type Quota } from '../../src/lib/schemas/casting';
import type { ClassProgression } from '../../src/lib/schemas/classProgression';
import type { FeatureChoiceGrant } from '../../src/lib/schemas/featureChoice';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { parseSpellGrantRows } from '../../src/lib/services/grantedSpells';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { getSpellLibrary, resolveSpell } from '../../src/lib/spellLibrary';
import { libraryKey } from '../support/libraryKey';

/** Stand der Inventur (Plan Stufe 1). */
const DECLARATION_COUNT = 35;

interface Declaration {
  key: string;
  desc: string;
  grantsChoice?: FeatureChoiceGrant;
  grantsCasting: CastingGrant;
  /** Nur bei Klassenmerkmalen: die Tabelle, aus der `count.column` liest. */
  table: ClassProgression | null;
}

let cached: Declaration[] | null = null;

async function declarations(): Promise<Declaration[]> {
  if (cached) return cached;
  const out: Declaration[] = [];

  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(libraryKey(info));
    if (!prog) continue;
    // Subklassen haben keine eigene Stufentabelle.
    const table = prog.subclassOf ? await getProgressionByKey(prog.subclassOf) : prog;
    for (const f of prog.features)
      if (f.grantsCasting)
        out.push({ key: f.key, desc: f.desc, grantsChoice: f.grantsChoice, grantsCasting: f.grantsCasting, table });
  }
  for (const info of await getSpeciesList()) {
    const spec = await getSpeciesByKey(libraryKey(info));
    for (const t of spec?.traits ?? [])
      if (t.grantsCasting)
        out.push({ key: t.key, desc: t.desc, grantsChoice: t.grantsChoice, grantsCasting: t.grantsCasting, table: null });
  }
  for (const feat of await getFeats())
    if (feat.grantsCasting)
      out.push({
        key: feat.sourceKey ?? '',
        desc: feat.desc ?? '',
        grantsChoice: feat.grantsChoice,
        grantsCasting: feat.grantsCasting,
        table: null,
      });

  cached = out;
  return out;
}

const quotasOf = (d: Declaration): Quota[] => d.grantsCasting.quotas;

const columnNames = (prog: ClassProgression): Set<string> =>
  new Set(prog.levels.flatMap((r) => Object.keys(r.columns)));

describe('grantsCasting im Vault', () => {
  it('deckt den Bestand ab', async () => {
    const all = await declarations();
    expect((await getClasses()).length, 'Vault-Shim aktiv?').toBeGreaterThan(5);
    expect(all).toHaveLength(DECLARATION_COUNT);
    expect(all.filter((d) => !d.key)).toEqual([]);
  });

  it('bezieht jedes `when` auf eine Option desselben Merkmals', async () => {
    for (const d of await declarations()) {
      const options = (d.grantsChoice?.options ?? []).map((o) => o.value);
      for (const quota of quotasOf(d)) {
        for (const [key, value] of Object.entries(quota.when ?? {})) {
          expect(key, `${d.key}/${quota.id}`).toBe('option');
          expect(options, `${d.key}/${quota.id}`).toContain(value);
        }
      }
    }
  });

  it('trifft mit jedem Fremdverweis ein vorhandenes Ziel', async () => {
    const all = await declarations();
    const byKey = new Map(all.map((d) => [d.key, d]));
    const hasQuota = (featureKey: string, quotaId: string): boolean =>
      !!byKey.get(featureKey)?.grantsCasting.quotas.some((q) => q.id === quotaId);

    for (const d of all) {
      for (const patch of d.grantsCasting.patches)
        expect(hasQuota(patch.feature, patch.quota), `${d.key} → ${patch.feature}/${patch.quota}`).toBe(true);

      const sameAs = d.grantsCasting.ability?.sameAs;
      if (sameAs) expect(byKey.has(sameAs), `${d.key} → ${sameAs}`).toBe(true);

      for (const quota of quotasOf(d)) {
        const from = quota.pool.from;
        if (!from) continue;
        expect(hasQuota(from.feature || d.key, from.quota), `${d.key}/${quota.id} → ${from.quota}`).toBe(true);
      }
    }
  });

  it('nennt nur Spalten, die die Klassentabelle führt', async () => {
    for (const d of await declarations()) {
      const columns = d.table ? columnNames(d.table) : new Set<string>();
      const wanted = quotasOf(d).flatMap((q) => [
        ...(q.count && 'column' in q.count ? [q.count.column] : []),
        ...q.cast.flatMap((c) =>
          c.kind === 'uses' && typeof c.count === 'object' && 'column' in c.count ? [c.count.column] : [],
        ),
      ]);
      for (const column of wanted) expect([...columns], d.key).toContain(column);
    }
  });

  it('findet zu jedem `fromDescTable` eine lesbare Tabelle', async () => {
    for (const d of await declarations()) {
      if (!quotasOf(d).some((q) => q.pool.fromDescTable)) continue;
      expect(parseSpellGrantRows(d.desc).length, d.key).toBeGreaterThan(0);
    }
  });

  it('löst jeden deklarierten Zaubernamen zu einem Bibliotheks-Key auf', async () => {
    const lib = await getSpellLibrary();
    for (const d of await declarations()) {
      const names = quotasOf(d).flatMap((q) => [
        ...q.pool.names,
        ...(q.pool.fromDescTable ? parseSpellGrantRows(d.desc).flatMap((r) => r.names) : []),
      ]);
      for (const name of names) expect(resolveSpell(lib, name)?.key, `${d.key}: ${name}`).toBeTruthy();
    }
  });

  it('hält Quota-Ids innerhalb eines Merkmals unterscheidbar', async () => {
    for (const d of await declarations()) {
      const seen = quotasOf(d).map((q) => `${q.id}|${q.since ?? ''}|${JSON.stringify(q.when ?? {})}`);
      expect(new Set(seen).size, d.key).toBe(seen.length);
    }
  });
});

interface ExampleFile {
  declarations: { key: string; grantsCasting: unknown }[];
}

const examples = (): ExampleFile['declarations'] =>
  (JSON.parse(readFileSync('docs/plan/zauberquellen-beispiele.json', 'utf-8')) as ExampleFile).declarations;

/**
 * Bei festem Pool sind `count` und `levels` redundant: die Zahl ist die Länge der Liste, der
 * Grad steht am Zauber. Der Vault schreibt sie deshalb nicht mehr, die Beispiele noch.
 */
function comparable(raw: unknown): CastingGrant {
  const grant = castingGrantSchema.parse(raw);
  return {
    ...grant,
    quotas: grant.quotas.map((q) => {
      const fixedPool = q.pool.names.length > 0 || q.pool.fromDescTable;
      return { ...q, count: fixedPool ? undefined : q.count, levels: fixedPool ? undefined : q.levels };
    }),
  };
}

describe('Beispiele des Plans', () => {
  it('deklariert die dokumentierten 13 Merkmale', () => {
    expect(examples()).toHaveLength(13);
  });

  it('stimmt mit dem Vault überein', async () => {
    const byKey = new Map((await declarations()).map((d) => [d.key, d]));
    for (const example of examples()) {
      const vault = byKey.get(example.key);
      expect(vault, example.key).toBeDefined();
      expect(comparable(vault!.grantsCasting), example.key).toEqual(comparable(example.grantsCasting));
    }
  });
});

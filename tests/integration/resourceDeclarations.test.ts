/**
 * Der Bestand an `grantsResource` im ECHTEN Vault: jede Zähler-Spalte gehört einer Deklaration,
 * jeder Fremdverweis trifft, und die abgeleiteten Zauberplätze treffen die Klassentabelle.
 *
 *   npm run test -- resourceDeclarations
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../../src/lib/classLibrary';
import { getFeats } from '../../src/lib/featsLibrary';
import { CLASS_RESOURCE_COLUMNS } from '../../src/lib/domain/classResources';
import type { ClassProgression } from '../../src/lib/schemas/classProgression';
import type { ResourceGrant } from '../../src/lib/schemas/resource';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { resolveResources } from '../../src/lib/services/resources/resolve';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { libraryKey } from '../support/libraryKey';
import { vaultCharacter } from '../support/vaultCharacter';

interface Declaration {
  key: string;
  grantsResource: ResourceGrant;
  /** Nur bei Klassenmerkmalen: die Tabelle, aus der `max.column` liest. */
  table: ClassProgression | null;
}

let cached: Declaration[] | null = null;

async function declarations(): Promise<Declaration[]> {
  if (cached) return cached;
  const out: Declaration[] = [];

  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(libraryKey(info));
    if (!prog) continue;
    const table = prog.subclassOf ? await getProgressionByKey(prog.subclassOf) : prog;
    for (const f of prog.features)
      if (f.grantsResource) out.push({ key: f.key, grantsResource: f.grantsResource, table });
  }
  for (const info of await getSpeciesList()) {
    const spec = await getSpeciesByKey(libraryKey(info));
    for (const t of spec?.traits ?? [])
      if (t.grantsResource) out.push({ key: t.key, grantsResource: t.grantsResource, table: null });
  }
  for (const feat of await getFeats())
    if (feat.grantsResource)
      out.push({ key: feat.sourceKey ?? '', grantsResource: feat.grantsResource, table: null });

  cached = out;
  return out;
}

const columnNames = (prog: ClassProgression): Set<string> =>
  new Set(prog.levels.flatMap((r) => Object.keys(r.columns)));

/**
 * Wer eine Spalte nennt — Vorrat wie freie Wirkung, als `Klassen-Key/Merkmal`. Kleriker und
 * Paladin führen beide `Channel Divinity`: dieselbe Spalte in ZWEI Tabellen ist kein Doppel.
 */
async function declaredColumns(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const add = (column: string, by: string): void => { out.set(column, [...(out.get(column) ?? []), by]); };

  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(libraryKey(info));
    if (!prog) continue;
    for (const f of prog.features) {
      for (const pool of f.grantsResource?.pools ?? []) {
        if (pool.shape.kind === 'slots') continue;
        if (typeof pool.shape.max === 'object' && 'column' in pool.shape.max)
          add(pool.shape.max.column, `${prog.key}/${f.key}`);
      }
      for (const quota of f.grantsCasting?.quotas ?? [])
        for (const option of quota.cast)
          if (option.kind === 'uses' && typeof option.count === 'object' && 'column' in option.count)
            add(option.count.column, `${prog.key}/${f.key}`);
    }
  }
  return out;
}

describe('grantsResource im Vault', () => {
  it('deckt jede Zähler-Spalte genau einmal je Klasse ab', async () => {
    expect((await getClasses()).length, 'Vault-Shim aktiv?').toBeGreaterThan(5);
    const declared = await declaredColumns();
    const counting = Object.entries(CLASS_RESOURCE_COLUMNS)
      .filter(([, def]) => def.kind === 'count')
      .map(([column]) => column);

    expect(counting.filter((c) => !declared.has(c))).toEqual([]);
    for (const [column, by] of declared) {
      const classes = by.map((entry) => entry.split('/')[0]);
      expect([...new Set(classes)], column).toHaveLength(by.length);
    }
  });

  it('nennt nur Spalten, die die Klassentabelle führt', async () => {
    for (const d of await declarations()) {
      const columns = d.table ? columnNames(d.table) : new Set<string>();
      for (const pool of d.grantsResource.pools) {
        const wanted =
          pool.shape.kind === 'slots'
            ? 'columns' in pool.shape.levels
              ? pool.shape.levels.columns
              : [pool.shape.levels.countColumn, pool.shape.levels.levelColumn]
            : typeof pool.shape.max === 'object' && 'column' in pool.shape.max
              ? [pool.shape.max.column]
              : [];
        for (const column of wanted) expect([...columns], `${d.key}/${pool.id}`).toContain(column);
      }
    }
  });

  it('trifft mit jedem Zuschlag einen deklarierten Pool', async () => {
    const all = await declarations();
    const byKey = new Map(all.map((d) => [d.key, d]));
    const shared = new Set(all.flatMap((d) => d.grantsResource.pools.map((p) => p.shared).filter(Boolean)));

    for (const d of all)
      for (const mod of d.grantsResource.mods) {
        const { feature, pool, shared: sharedName } = mod.target;
        if (sharedName) {
          expect(shared, `${d.key} → ${sharedName}`).toContain(sharedName);
          continue;
        }
        const owner = byKey.get(feature || d.key);
        expect(owner?.grantsResource.pools.map((p) => p.id) ?? [], `${d.key} → ${feature}/${pool}`).toContain(pool);
      }
  });
});

/** Die Zauberwirker des Vaults mit den Graden ihrer Klassentabelle. */
const CASTERS: [name: string, who: string, standard: number[]][] = [
  ['Kläri', 'Kleriker 1', [2]],
  ['Bälgär', 'Magier 3', [4, 2]],
  ['Bölgör', 'Paladin 5', [4, 2]],
  ['Bulgur', 'Druide 2', [3]],
  ['Silvara/Sivral', 'Zauberer 3', [4, 2]],
  ['Thromm Flechtenstein', 'Druide 3', [4, 2]],
];

describe('abgeleitete Zauberplätze', () => {
  it('stehen im Vorrat `standard`, wie die Klassentabelle sie führt', async () => {
    for (const [name, who, standard] of CASTERS) {
      const { pools, issues } = await resolveResources(vaultCharacter(name));
      const slots = pools.find((p) => p.shared === 'standard');
      expect(slots?.max, `${name} (${who})`).toEqual(Array.from({ length: 9 }, (_, i) => standard[i] ?? 0));
      expect(issues, name).toEqual([]);
    }
  });
});

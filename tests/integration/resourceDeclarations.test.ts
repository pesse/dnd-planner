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
import { getProgressionByKey, levelTables } from '../../src/lib/services/classProgression';
import { resolveResources } from '../../src/lib/services/resources/resolve';
import { resourceViews } from '../../src/lib/services/resources/project';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import { libraryKey } from '../support/libraryKey';
import { testCharacter } from '../support/testCharacter';

interface Declaration {
  key: string;
  grantsResource: ResourceGrant;
  /** Nur bei Klassenmerkmalen: die Tabellen, aus denen `max.column` liest. */
  tables: ClassProgression[];
}

let cached: Declaration[] | null = null;

async function declarations(): Promise<Declaration[]> {
  if (cached) return cached;
  const out: Declaration[] = [];

  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(libraryKey(info));
    if (!prog) continue;
    const base = prog.subclassOf ? await getProgressionByKey(prog.subclassOf) : null;
    const tables = prog.subclassOf ? levelTables(base, prog) : levelTables(prog);
    for (const f of prog.features)
      if (f.grantsResource) out.push({ key: f.key, grantsResource: f.grantsResource, tables });
  }
  for (const info of await getSpeciesList()) {
    const spec = await getSpeciesByKey(libraryKey(info));
    for (const t of spec?.traits ?? [])
      if (t.grantsResource) out.push({ key: t.key, grantsResource: t.grantsResource, tables: [] });
  }
  for (const feat of await getFeats())
    if (feat.grantsResource)
      out.push({ key: feat.sourceKey ?? '', grantsResource: feat.grantsResource, tables: [] });

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
      const columns = new Set(d.tables.flatMap((p) => [...columnNames(p)]));
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

/**
 * Die Kette aus `levelTables`, am einzigen Vault-Fall: die Kämpfertabelle führt keine
 * Überlegenheitswürfel, die des Kampfmeisters schon.
 */
describe('Stufentabelle einer Subklasse', () => {
  const fighter = (level: number) =>
    ({
      classes: [{ sourceKey: 'srd-2024_fighter', subclassKey: 'phb-2024_battle-master', level }],
    }) as Parameters<typeof resolveResources>[0];

  it('speist den Vorrat ihres eigenen Merkmals', async () => {
    for (const [level, max] of [[3, 4], [6, 4], [7, 5], [14, 5], [15, 6], [20, 6]]) {
      const { pools, issues } = await resolveResources(fighter(level));
      const dice = pools.find((p) => p.featureKey.endsWith('_combat-superiority'));
      expect([level, dice?.max[0], dice?.recharge], `Stufe ${level}`).toEqual([level, max, 'short-rest']);
      expect(issues, `Stufe ${level}`).toEqual([]);
    }
  });

  it('lässt die geerbten Spalten der Grundklasse stehen', async () => {
    const { pools } = await resolveResources(fighter(7));
    const secondWind = pools.find((p) => p.featureKey.endsWith('_second-wind'));
    expect(secondWind?.max[0]).toBe(3);
  });
});

/** Die Zauberwirker unter den Prüflingen mit den Graden ihrer Klassentabelle. */
const CASTERS: [name: string, who: string, standard: number[]][] = [
  ['Prüfling Kleriker', 'Kleriker 1', [2]],
  ['Prüfling Magier', 'Magier 3', [4, 2]],
  ['Prüfling Paladin', 'Paladin 5', [4, 2]],
  ['Prüfling Druide', 'Druide 2', [3]],
  ['Prüfling Feenmagie', 'Zauberer 3', [4, 2]],
  ['Prüfling Mondkreis', 'Druide 3', [4, 2]],
];

describe('abgeleitete Zauberplätze', () => {
  it('stehen im Vorrat `standard`, wie die Klassentabelle sie führt', async () => {
    for (const [name, who, standard] of CASTERS) {
      const { pools, issues } = await resolveResources(testCharacter(name));
      const slots = pools.find((p) => p.shared === 'standard');
      expect(slots?.max, `${name} (${who})`).toEqual(Array.from({ length: 9 }, (_, i) => standard[i] ?? 0));
      expect(issues, name).toEqual([]);
    }
  });
});

/** Die Vorräte, die die Redaktion ohne KI trägt — an Probe-Charakteren, nie an bespielten. */
describe('redigierte Vorräte', () => {
  const probe = (sourceKey: string, level: number, subclassKey?: string) =>
    ({ classes: [{ sourceKey, subclassKey, level }] }) as Parameters<typeof resolveResources>[0];
  const pool = async (c: Parameters<typeof resolveResources>[0], suffix: string) => {
    const { pools, issues } = await resolveResources(c);
    expect(issues, suffix).toEqual([]);
    return pools.find((p) => p.featureKey.endsWith(suffix));
  };

  it('Bardische Inspiration trägt ihren Würfel, und Quell der Inspiration verkürzt die Rast', async () => {
    const [low, high] = await Promise.all([
      pool(probe('srd-2024_bard', 4), '_bardic-inspiration'),
      pool(probe('srd-2024_bard', 5), '_bardic-inspiration'),
    ]);
    expect([low?.die, low?.recharge]).toEqual(['d6', 'long-rest']);
    expect([high?.die, high?.recharge]).toEqual(['d8', 'short-rest']);
    expect(resourceViews([high!])[0].label).toContain('(W8)');
  });

  it('Kampfrausch gibt bei Kurzer Rast einen Einsatz zurück, und der Bogen nennt es', async () => {
    const rage = await pool(probe('srd-2024_barbarian', 3), '_rage');
    expect([rage?.recharge, rage?.shortRestRegain]).toEqual(['long-rest', 1]);
    expect(resourceViews([rage!])[0].hint).toBe('Lange Rast · Kurze Rast: 1 zurück');
  });

  it('nennt, wogegen ein Einsatz außerhalb der Rast zurückkommt', async () => {
    const rend = await pool(probe('srd-2024_rogue', 17, 'phb-2024_soulknife'), '_rend-mind');
    expect(rend?.restoreDe).toEqual(['Psionische Energiewürfel (3)']);
    const inspiration = await pool(probe('srd-2024_bard', 5), '_bardic-inspiration');
    expect(resourceViews([inspiration!])[0].hint).toBe('Kurze Rast · zurück gegen Zauberplatz');
  });

  it('nennt, was der Zähler nicht zählt — am eigenen Vorrat und per Zuschlag am fremden', async () => {
    const dice = await pool(probe('srd-2024_rogue', 3, 'phb-2024_soulknife'), '_psionic-power');
    expect(resourceViews([dice!])[0].hint).toContain('1. Psychisches Flüstern je Lange Rast ohne Würfel');
    const points = await pool(probe('srd-2024_sorcerer', 6, 'phb-2024_aberrant-sorcery'), '_font-of-magic');
    expect(points?.notesDe).toEqual(['Psionische Zauber: Zaubereipunkte in Höhe des Grades statt Zauberplatz']);
  });

  it('der Überlegenheitswürfel wächst in Stufenschritten', async () => {
    const dice = await Promise.all([3, 10, 18].map((l) => pool(probe('srd-2024_fighter', l, 'phb-2024_battle-master'), '_combat-superiority')));
    expect(dice.map((d) => d?.die)).toEqual(['d8', 'd10', 'd12']);
  });

  it('Tatendrang zweimal ab Stufe 17, Handauflegen 5 je Stufe', async () => {
    expect((await pool(probe('srd-2024_fighter', 16), '_action-surge'))?.max[0]).toBe(1);
    expect((await pool(probe('srd-2024_fighter', 17), '_action-surge'))?.max[0]).toBe(2);
    expect((await pool(probe('srd-2024_paladin', 7), '_lay-on-hands'))?.max[0]).toBe(35);
  });
});

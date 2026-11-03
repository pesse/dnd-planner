import { getMonsterLibrary, invalidateMonsterLibrary } from '../../monsterLibrary';
import { availableArt } from '../../artUrl';
import { monsterArtSlug, monsterArtUrl } from '../../libraryArt';
import { presentEntryArt } from '../libraryEntryArt';
import { monsterAlignmentLabel, monsterSizeLabel, monsterTypeLabel } from '../../types';
import { MONSTER_SIZE_KEYS } from '../../schemas/vocabulary';
import { crLabel } from '../monsterFormat';
import { readScopeMonsters } from '../contextLoad';
import type { Monster } from '../../types';
import { byLabel, sourceFacet, SOURCE_FACET, type CatalogRow, type CatalogSpec } from './catalogTypes';

function monsterRow(slug: string, path: string, m: Monster, art: Set<string>): CatalogRow {
  return {
    path,
    entryName: slug,
    name: m.name || slug,
    altName: m.name_en,
    group: m.type,
    icon: monsterArtUrl(m),
    art: presentEntryArt('monster', monsterArtSlug(m), [], art),
    iconColor: 'var(--red)',
    cells: {
      cr: { text: crLabel(m.challenge_rating), sort: m.challenge_rating },
      size: { text: monsterSizeLabel(m.size), sort: MONSTER_SIZE_KEYS.indexOf(m.size) },
      alignment: { text: monsterAlignmentLabel(m.alignment) },
      ac: { text: String(m.armor_class), sort: m.armor_class },
      hp: { text: String(m.hit_points), sort: m.hit_points },
    },
    facets: { source: sourceFacet(m.source) },
  };
}

/** Die eigenen Monster eines Akts oder der Kampagne als Katalogzeilen. */
export async function scopeMonsterRows(scopeDir: string): Promise<CatalogRow[]> {
  const [own, art] = await Promise.all([readScopeMonsters(scopeDir), availableArt()]);
  return own.map(({ slug, path, monster }) => monsterRow(slug, path, monster, art));
}

/** Der Typ ist der Filter; alle Typen teilen sich ein Spalten-Set. */
export const monsterCatalog: CatalogSpec = {
  kind: 'monster',
  type: 'monster',
  label: 'Monster',
  groupLabel: 'Typ',
  columns: {
    cr: { label: 'HG', numeric: true },
    size: { label: 'Größe' },
    alignment: { label: 'Gesinnung' },
    ac: { label: 'RK', numeric: true },
    hp: { label: 'TP', numeric: true },
  },
  columnSets: { '': ['cr', 'size', 'alignment', 'ac', 'hp'] },
  facets: { source: SOURCE_FACET },
  invalidate: invalidateMonsterLibrary,
  async load() {
    const [hits, art] = await Promise.all([getMonsterLibrary(), availableArt()]);
    const rows = hits.map(({ slug, path, monster }) => monsterRow(slug, path, monster, art));
    const types = [...new Set(rows.map((r) => r.group))];
    return { rows, groups: types.map((id) => ({ id, label: monsterTypeLabel(id) })).sort(byLabel) };
  },
};

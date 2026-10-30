import { getMonsterLibrary, invalidateMonsterLibrary } from '../../monsterLibrary';
import { monsterArtUrl } from '../../libraryArt';
import { monsterSizeLabel, monsterTypeLabel } from '../../types';
import { MONSTER_SIZE_KEYS } from '../../schemas/vocabulary';
import { crLabel } from '../monsterFormat';
import { byLabel, sourceFacet, type CatalogSpec } from './catalogTypes';

/** Der Typ ist der Filter; alle Typen teilen sich ein Spalten-Set. */
export const monsterCatalog: CatalogSpec = {
  kind: 'monster',
  type: 'monster',
  label: 'Monster',
  groupLabel: 'Typ',
  columns: {
    cr: { label: 'HG', numeric: true },
    size: { label: 'Größe' },
    ac: { label: 'RK', numeric: true },
    hp: { label: 'TP', numeric: true },
  },
  columnSets: { '': ['cr', 'size', 'ac', 'hp'] },
  facets: { source: 'Quelle' },
  invalidate: invalidateMonsterLibrary,
  async load() {
    const hits = await getMonsterLibrary();
    const rows = hits.map(({ slug, path, monster: m }) => ({
      path,
      entryName: slug,
      name: m.name || slug,
      altName: m.name_en,
      group: m.type,
      icon: monsterArtUrl(m),
      iconColor: 'var(--red)',
      cells: {
        cr: { text: crLabel(m.challenge_rating), sort: m.challenge_rating },
        size: { text: monsterSizeLabel(m.size), sort: MONSTER_SIZE_KEYS.indexOf(m.size) },
        ac: { text: String(m.armor_class), sort: m.armor_class },
        hp: { text: String(m.hit_points), sort: m.hit_points },
      },
      facets: { source: sourceFacet(m.source) },
    }));
    const types = [...new Set(rows.map((r) => r.group))];
    return { rows, groups: types.map((id) => ({ id, label: monsterTypeLabel(id) })).sort(byLabel) };
  },
};

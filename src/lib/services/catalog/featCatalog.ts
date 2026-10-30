import { FEAT_CATEGORY_DE, featDisplayName, featPrereq, getFeats, invalidateFeatsCache, type FeatEntry } from '../../featsLibrary';
import { featArtUrl } from '../../libraryArt';
import { FEAT_CATEGORIES } from '../../schemas/vocabulary';
import { ABILITY_ABBR_DE, ABILITY_KEYS, ABILITY_NAMES, abilityKeyOf, type AbilityKey } from '../../schemas/abilities';
import { abilityIncreaseOptions } from '../declaration/abilityIncrease';
import { featPrereqLevel } from '../featPrerequisites';
import { sourceFacet, type CatalogCell, type CatalogSpec } from './catalogTypes';

/** Fest gewährt, zur Wahl gestellt oder an einer Zweigoption hängend — die Spalte fragt nur „welche überhaupt". */
function increasedAbilities(feat: FeatEntry): Set<AbilityKey> {
  const names: string[] = (feat.grants?.abilities ?? []).map((a) => a.ability);
  for (const choice of feat.grantsChoice ?? []) {
    if (choice.kind === 'abilityIncrease') names.push(...abilityIncreaseOptions(choice));
    if (choice.kind === 'optionList') {
      for (const option of choice.options) names.push(...(option.grants?.abilities ?? []).map((a) => a.ability));
    }
  }
  return new Set(names.map(abilityKeyOf).filter((k): k is AbilityKey => !!k));
}

function abilityCell(feat: FeatEntry): CatalogCell {
  const keys = increasedAbilities(feat);
  if (!keys.size) return { text: '', sort: 'zz' };
  if (keys.size === ABILITY_NAMES.length) return { text: 'beliebig', sort: 'z' };
  const text = ABILITY_KEYS.filter((k) => keys.has(k)).map((k) => ABILITY_ABBR_DE[k]).join(', ');
  return { text, sort: text };
}

/** Die Kategorie ist der Filter; alle Kategorien teilen sich ein Spalten-Set. */
export const featCatalog: CatalogSpec = {
  kind: 'feat',
  type: 'feat',
  label: 'Talente',
  groupLabel: 'Kategorie',
  columns: {
    level: { label: 'Stufe', numeric: true },
    prerequisite: { label: 'Voraussetzung', wrap: true },
    abilities: { label: 'Attribut +1' },
    repeatable: { label: 'Wdh.', center: true },
  },
  columnSets: { '': ['level', 'prerequisite', 'abilities', 'repeatable'] },
  facets: { source: 'Quelle' },
  invalidate: invalidateFeatsCache,
  async load() {
    const feats = await getFeats();
    const rows = feats.map((f) => {
      const level = featPrereqLevel(f.prerequisite);
      return {
        path: f.path,
        entryName: f.path.slice(f.path.lastIndexOf('/') + 1).replace('.json', ''),
        name: featDisplayName(f),
        altName: f.name,
        group: f.category ?? 'General',
        icon: featArtUrl(f),
        iconColor: 'var(--arcane)',
        cells: {
          level: level ? { text: String(level), sort: level } : { text: '', sort: 0 },
          prerequisite: { text: featPrereq(f) },
          abilities: abilityCell(f),
          repeatable: f.repeatable ? { text: '✓', sort: 1, color: 'var(--arcane)' } : { text: '', sort: 0 },
        },
        facets: { source: sourceFacet(f.librarySource) },
      };
    });
    return { rows, groups: FEAT_CATEGORIES.map((id) => ({ id, label: FEAT_CATEGORY_DE[id] })) };
  },
};

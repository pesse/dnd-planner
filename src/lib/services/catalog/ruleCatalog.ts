import { getRules, invalidateRulesCache, ruleDisplayName, ruleText } from '../../rulesLibrary';
import { RULE_CATEGORIES, RULE_CATEGORY_DE } from '../../schemas/rule';
import { sourceFacet, SOURCE_FACET, type CatalogSpec } from './catalogTypes';

/** Nur der Name, die Kategorie steht als Gruppe daneben; der Regeltext schwebt über der Zeile. */
export const ruleCatalog: CatalogSpec = {
  kind: 'rule',
  type: 'rule',
  label: 'Regeln',
  groupLabel: 'Kategorie',
  textOnly: true,
  columns: {},
  columnSets: { '': [] },
  facets: { source: SOURCE_FACET },
  invalidate: invalidateRulesCache,
  async load() {
    const rules = await getRules();
    const rows = rules.map((r) => ({
      path: r.path,
      entryName: r.path.slice(r.path.lastIndexOf('/') + 1).replace('.json', ''),
      name: ruleDisplayName(r),
      altName: r.name,
      group: r.category,
      icon: null,
      iconColor: 'var(--ink)',
      tip: ruleText(r),
      cells: {},
      facets: { source: sourceFacet(r.source) },
    }));
    return { rows, groups: RULE_CATEGORIES.map((id) => ({ id, label: RULE_CATEGORY_DE[id] })) };
  },
};

import { getRules, invalidateRulesCache, ruleDisplayName, ruleText } from '../../rulesLibrary';
import { RULE_CATEGORIES, RULE_CATEGORY_DE } from '../../schemas/rule';
import { sourceFacet, SOURCE_FACET, type CatalogCell, type CatalogSpec } from './catalogTypes';

/** Erster Satz des Regeltexts, Verweise und Hervorhebungen als bloßer Text. */
function summaryCell(text: string): CatalogCell {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = plain.match(/^.*?[.!?:](?=\s|$)/)?.[0] ?? plain;
  return { text: sentence, title: plain.length > sentence.length ? plain : undefined };
}

/** Die Kategorie ist der Filter; alle Kategorien teilen sich ein Spalten-Set. */
export const ruleCatalog: CatalogSpec = {
  kind: 'rule',
  type: 'rule',
  label: 'Regeln',
  groupLabel: 'Kategorie',
  textOnly: true,
  columns: {
    nameEn: { label: 'Englisch' },
    summary: { label: 'Beschreibung', wrap: true },
  },
  columnSets: { '': ['nameEn', 'summary'] },
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
      cells: {
        nameEn: { text: r.name },
        summary: summaryCell(ruleText(r)),
      },
      facets: { source: sourceFacet(r.source) },
    }));
    return { rows, groups: RULE_CATEGORIES.map((id) => ({ id, label: RULE_CATEGORY_DE[id] })) };
  },
};

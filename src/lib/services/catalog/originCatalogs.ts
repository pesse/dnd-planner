/** Klassen, Spezies und Hintergründe als Kataloge: wenige Spalten, dafür ein Stimmungsbild. */
import { availableArt } from '../../artUrl';
import { artSpecies, presentEntryArt } from '../libraryEntryArt';
import { CLASSES_PATH } from '../../classLibrary';
import { SPECIES_PATH } from '../../speciesLibrary';
import { BACKGROUNDS_PATH } from '../../backgroundsLibrary';
import { featDisplayName, getFeats } from '../../featsLibrary';
import { sourceLabel } from '../../schemas/source';
import { scanJsonFolder, type FileContext } from '../library/createLibrary';
import { byLabel, sourceFacet, SOURCE_FACET, type CatalogFacetValue, type CatalogRow, type CatalogSpec } from './catalogTypes';

type Raw = Record<string, any>;

interface Entry {
  data: Raw;
  ctx: FileContext;
}

async function scan(dir: string): Promise<Entry[]> {
  try {
    return await scanJsonFolder<Entry>(dir, (data, ctx) => ({ data, ctx }), (ctx) => ({ data: {}, ctx }));
  } catch {
    return [];
  }
}

function baseRow(e: Entry, iconColor: string): Omit<CatalogRow, 'group' | 'cells' | 'facets'> {
  const name = (e.data.nameDe as string) || (e.data.name as string) || e.ctx.filename.replace('.json', '');
  return {
    path: e.ctx.path,
    entryName: e.ctx.filename.replace('.json', ''),
    name,
    altName: e.data.name,
    icon: null,
    iconColor,
  };
}

const sourceCell = (data: Raw) => ({ text: sourceLabel(data.source) });

const CLASS_ROLE: CatalogFacetValue = { id: 'class', label: 'Klasse' };
const SUBCLASS_ROLE: CatalogFacetValue = { id: 'subclass', label: 'Unterklasse', order: 1 };

/** Die Basisklasse ist der Filter: sie zeigt sich selbst samt ihren Unterklassen. */
export const classCatalog: CatalogSpec = {
  kind: 'class',
  type: 'class',
  label: 'Klassen',
  groupLabel: 'Klasse',
  defaultLayout: 'gallery',
  columns: {
    role: { label: 'Art' },
    hitDie: { label: 'TW', numeric: true, title: 'Trefferwürfel' },
    source: { label: 'Quelle' },
  },
  columnSets: { '': ['role', 'hitDie', 'source'] },
  facets: { role: { label: 'Art' }, source: SOURCE_FACET },
  invalidate: () => {},
  async load() {
    const [entries, names, species] = await Promise.all([scan(CLASSES_PATH), availableArt(), artSpecies()]);
    const bases = entries.filter((e) => !e.data.subclassOf);
    const rows: CatalogRow[] = entries.map((e) => {
      const parent = e.data.subclassOf as string | undefined;
      const art = presentEntryArt(parent ? 'subclass' : 'class', e.data.key ?? '', species, names, parent);
      const hitDie = Number(e.data.hitDie) || 0;
      return {
        ...baseRow(e, 'var(--gold)'),
        group: parent ?? e.data.key ?? '',
        art,
        cells: {
          role: { text: parent ? SUBCLASS_ROLE.label : CLASS_ROLE.label, sort: parent ? 1 : 0 },
          hitDie: hitDie ? { text: `W${hitDie}`, sort: hitDie } : { text: '', sort: 0 },
          source: sourceCell(e.data),
        },
        facets: { role: parent ? SUBCLASS_ROLE : CLASS_ROLE, source: sourceFacet(e.data.source) },
      };
    });
    const groups = bases.map((e) => ({ id: e.data.key ?? '', label: baseRow(e, '').name })).sort(byLabel);
    return { rows, groups };
  },
};

export const speciesCatalog: CatalogSpec = {
  kind: 'species',
  type: 'species',
  label: 'Spezies',
  groupLabel: 'Quelle',
  defaultLayout: 'gallery',
  columns: { source: { label: 'Quelle' } },
  columnSets: { '': ['source'] },
  facets: {},
  invalidate: () => {},
  async load() {
    const [entries, names] = await Promise.all([scan(SPECIES_PATH), availableArt()]);
    const rows: CatalogRow[] = entries.map((e) => ({
      ...baseRow(e, 'var(--gold)'),
      group: sourceFacet(e.data.source).id,
      art: presentEntryArt('species', e.data.key ?? '', [], names),
      cells: { source: sourceCell(e.data) },
      facets: {},
    }));
    const groups = new Map(entries.map((e) => [sourceFacet(e.data.source).id, sourceFacet(e.data.source)]));
    return { rows, groups: [...groups.values()].sort(byLabel) };
  },
};

export const backgroundCatalog: CatalogSpec = {
  kind: 'background',
  type: 'background',
  label: 'Hintergründe',
  groupLabel: 'Quelle',
  defaultLayout: 'gallery',
  columns: {
    feat: { label: 'Herkunftstalent' },
    source: { label: 'Quelle' },
  },
  columnSets: { '': ['feat', 'source'] },
  facets: {},
  invalidate: () => {},
  async load() {
    const [entries, names, feats, species] =
      await Promise.all([scan(BACKGROUNDS_PATH), availableArt(), getFeats(), artSpecies()]);
    const featName = new Map(feats.map((f) => [f.sourceKey, featDisplayName(f)]));
    const rows: CatalogRow[] = entries.map((e) => ({
      ...baseRow(e, 'var(--gold)'),
      group: sourceFacet(e.data.source).id,
      art: presentEntryArt('background', e.data.key ?? '', species, names),
      cells: { feat: { text: featName.get(e.data.featKey) ?? '' }, source: sourceCell(e.data) },
      facets: {},
    }));
    const groups = new Map(entries.map((e) => [sourceFacet(e.data.source).id, sourceFacet(e.data.source)]));
    return { rows, groups: [...groups.values()].sort(byLabel) };
  },
};

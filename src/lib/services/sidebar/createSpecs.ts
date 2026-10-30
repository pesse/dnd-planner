/**
 * „Neues X"-Dialog je Entitätstyp: Vorlagensuche in der Bibliothek, leerer
 * Draft, KI-Aktion. Der Dialog selbst ist immer `CreateCardModal`.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AiAction } from '../aiActions/types';
import { createItemAction } from '../aiActions/itemAction';
import { createMonsterAction } from '../aiActions/monsterAction';
import { createSpellAction } from '../aiActions/spellAction';
import { blankFeat, featDraftName, searchFeatLibrary } from '../featCreate';
import { getClasses, classDisplayName, searchClassDrafts } from '../../classLibrary';
import { searchSpeciesDrafts } from '../../speciesLibrary';
import { searchBackgroundDrafts } from '../../backgroundsLibrary';
import {
  blankItem, displayName as itemDisplayName, getItemsByDir, loadedItemDirs, searchItems, toHomebrewCopy,
} from '../../itemLibrary';
import { blankSpell, getSpellLibrary, loadSpellByPath, searchSpells as searchSpellLib } from '../../spellLibrary';
import { parseBackground, parseClass, parseSpecies, normalizeItem } from '../../utils/schemaValidation';
import { searchMonsterLibrary } from '../../monsterLibrary';
import { BACKGROUND_TEMPLATE, CLASS_TEMPLATE, MONSTER_TEMPLATE, SPECIES_TEMPLATE } from '../../types';
import type { Background, ClassProgression, FileEntryType, Item, Monster, Species, Spell } from '../../types';

/** Deckungsgleich mit den Props von `CreateCardModal`. */
export interface CreateSpec<T> {
  type: FileEntryType;
  title: string;
  searchLibrary: (q: string) => Promise<{ name: string; load: () => Promise<T> }[]>;
  blank: (name: string) => T;
  buildAction?: (opts: { name?: string; template?: T }) => AiAction<T>;
  nameOf: (draft: T) => string;
  extraSelect?: {
    label: string;
    placeholder: string;
    load: () => Promise<{ value: string; label: string }[]>;
    apply: (draft: T, value: string) => void;
  };
}

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await invoke<string>('read_file_content', { path }));

async function searchMonsterTemplates(q: string): Promise<{ name: string; load: () => Promise<Monster> }[]> {
  return (await searchMonsterLibrary(q)).map((hit) => ({
    name: hit.monster.name,
    load: async () => hit.monster,
  }));
}

async function searchSpellLibrary(q: string): Promise<{ name: string; load: () => Promise<Spell> }[]> {
  const lib = await getSpellLibrary();
  return searchSpellLib(lib, q, null, '', 8).map((s) => ({
    name: s.spell.name,
    load: async () => (await loadSpellByPath(s.spell.path)) ?? blankSpell(s.spell.name),
  }));
}

async function searchItemLibrary(q: string): Promise<{ name: string; load: () => Promise<Item> }[]> {
  const dirs = loadedItemDirs();
  const entries = await Promise.all(dirs.map(async (d) => [d, await getItemsByDir(d)] as const));
  const libByDir = Object.fromEntries(entries);
  return searchItems(libByDir, q, 8).map((s) => ({
    name: itemDisplayName(s.item),
    load: async () => toHomebrewCopy(normalizeItem(await readJson(s.item.path))),
  }));
}

function blankClass(name: string): ClassProgression {
  return { ...structuredClone(CLASS_TEMPLATE), name: name || 'Neue Klasse', nameDe: name || 'Neue Klasse' };
}
function blankSpecies(name: string): Species {
  return { ...structuredClone(SPECIES_TEMPLATE), name: name || 'Neue Spezies', nameDe: name || 'Neue Spezies' };
}
function blankBackground(name: string): Background {
  return { ...structuredClone(BACKGROUND_TEMPLATE), name: name || 'Neuer Hintergrund', nameDe: name || 'Neuer Hintergrund' };
}

const searchClassLibrary = (q: string) => searchClassDrafts(q, parseClass, blankClass, 8);
const searchSpeciesLibrary = (q: string) => searchSpeciesDrafts(q, parseSpecies, blankSpecies, 8);
const searchBackgroundLibrary = (q: string) => searchBackgroundDrafts(q, parseBackground, blankBackground, 8);

/** Bindet T an der Definitionsstelle; die Registry selbst ist typunabhängig. */
const spec = <T>(s: CreateSpec<T>): CreateSpec<unknown> => s as CreateSpec<unknown>;

export const CREATE_SPECS = {
  monster: spec<Monster>({
    type: 'monster',
    title: 'Neues Monster',
    searchLibrary: searchMonsterTemplates,
    blank: (name) => ({ ...MONSTER_TEMPLATE, name: name || MONSTER_TEMPLATE.name }),
    buildAction: createMonsterAction,
    nameOf: (m) => m.name || 'Monster',
  }),
  spell: spec<Spell>({
    type: 'spell',
    title: 'Neuer Zauber',
    searchLibrary: searchSpellLibrary,
    blank: blankSpell,
    buildAction: createSpellAction,
    nameOf: (s) => s.name || 'Zauber',
  }),
  item: spec<Item>({
    type: 'item',
    title: 'Neuer Gegenstand',
    searchLibrary: searchItemLibrary,
    blank: (name) => blankItem(name, loadedItemDirs()[0] ?? 'other'),
    buildAction: createItemAction,
    nameOf: (i) => i.name_de || i.name || 'Gegenstand',
  }),
  class: spec<ClassProgression>({
    type: 'class',
    title: 'Neue Klasse',
    searchLibrary: searchClassLibrary,
    blank: blankClass,
    nameOf: (c) => c.nameDe || c.name || 'Klasse',
    extraSelect: {
      label: 'Subklasse von',
      placeholder: '— (eigenständige Klasse)',
      load: async () =>
        (await getClasses())
          .filter((c) => !c.subclassOf && c.key)
          .map((c) => ({ value: c.key!, label: classDisplayName(c) })),
      apply: (draft, value) => { draft.subclassOf = value; },
    },
  }),
  species: spec<Species>({
    type: 'species',
    title: 'Neue Spezies',
    searchLibrary: searchSpeciesLibrary,
    blank: blankSpecies,
    nameOf: (s) => s.nameDe || s.name || 'Spezies',
  }),
  feat: spec({
    type: 'feat',
    title: 'Neues Talent',
    searchLibrary: searchFeatLibrary,
    blank: blankFeat,
    nameOf: featDraftName,
  }),
  background: spec<Background>({
    type: 'background',
    title: 'Neuer Hintergrund',
    searchLibrary: searchBackgroundLibrary,
    blank: blankBackground,
    nameOf: (b) => b.nameDe || b.name || 'Hintergrund',
  }),
} satisfies Partial<Record<FileEntryType, CreateSpec<unknown>>>;

export type CreateKind = keyof typeof CREATE_SPECS;

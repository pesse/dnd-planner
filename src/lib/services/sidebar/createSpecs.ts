/**
 * „Neues X"-Dialog je Entitätstyp: Vorlagensuche (Bibliothek + Open5e), leerer
 * Draft, KI-Aktion. Der Dialog selbst ist immer `CreateCardModal`.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AiAction } from '../aiActions/types';
import { createItemAction } from '../aiActions/itemAction';
import { createMonsterAction } from '../aiActions/monsterAction';
import { createSpellAction } from '../aiActions/spellAction';
import { searchMonsters, mapApiResourceToMonster, type DndApiRef } from '../dndApi';
import {
  DEFAULT_DOCUMENT, getBackground as getBackgroundRaw, getClass, getOpen5eItem, getSpecies as getSpeciesRaw,
  getSpell, listBackgrounds, listClasses, listSpecies, searchOpen5eItems, searchOpen5eSpells,
} from '../open5eClient';
import { mapOpen5eItem } from '../open5eItemMapper';
import { mapOpen5eSpell } from '../open5eSpellMapper';
import { mapV2 } from '../classProgression';
import { mapV2Species } from '../speciesData';
import { mapV2Background } from '../backgroundData';
import { blankFeat, featDraftName, searchOpen5eFeats, loadOpen5eFeat, searchFeatLibrary } from '../featCreate';
import { getClasses, searchClasses, classDisplayName } from '../../classLibrary';
import { getSpeciesList, searchSpecies, speciesDisplayName } from '../../speciesLibrary';
import { getBackgroundsList, searchBackgrounds, backgroundDisplayName } from '../../backgroundsLibrary';
import {
  blankItem, displayName as itemDisplayName, getItemsByDir, loadedItemDirs, searchItems, toHomebrewCopy,
} from '../../itemLibrary';
import { blankSpell, getSpellLibrary, loadSpellByPath, searchSpells as searchSpellLib } from '../../spellLibrary';
import { parseBackground, parseClass, parseMonster, parseSpecies, normalizeItem } from '../../utils/schemaValidation';
import { BACKGROUND_TEMPLATE, CLASS_TEMPLATE, MONSTER_TEMPLATE, SPECIES_TEMPLATE } from '../../types';
import type { Background, ClassProgression, FileEntryType, Item, Monster, Species, Spell } from '../../types';

/** Deckungsgleich mit den Props von `CreateCardModal`. */
export interface CreateSpec<T> {
  type: FileEntryType;
  title: string;
  searchApi: (q: string) => Promise<DndApiRef[]>;
  mapApi?: (data: Record<string, unknown>) => T;
  loadApi?: (ref: DndApiRef) => Promise<T>;
  searchLibrary?: (q: string) => Promise<{ name: string; load: () => Promise<T> }[]>;
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

const MONSTERS_PATH = './vault/monsters';

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await invoke<string>('read_file_content', { path }));

// Alle Vault-Monster (Name + Loader) einmal einlesen und cachen.
let monsterLibCache: { name: string; load: () => Promise<Monster> }[] | null = null;
async function searchMonsterLibrary(q: string): Promise<{ name: string; load: () => Promise<Monster> }[]> {
  if (!monsterLibCache) {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_json_entries', { path: MONSTERS_PATH });
    const paths = entries.filter((e) => !e.is_dir && e.name.endsWith('.json')).map((e) => `${MONSTERS_PATH}/${e.name}`);
    for (const d of entries.filter((e) => e.is_dir)) {
      const files = await invoke<string[]>('list_json_files', { path: `${MONSTERS_PATH}/${d.name}` }).catch(() => [] as string[]);
      paths.push(...files.map((f) => `${MONSTERS_PATH}/${d.name}/${f}`));
    }
    const loaded = await Promise.all(paths.map(async (path) => {
      try {
        const r = parseMonster(await readJson(path));
        return r.ok ? { name: r.data.name, load: async () => r.data } : null;
      } catch { return null; }
    }));
    monsterLibCache = loaded.filter((x): x is { name: string; load: () => Promise<Monster> } => x !== null);
  }
  const ql = q.toLowerCase();
  return monsterLibCache.filter((h) => h.name.toLowerCase().includes(ql)).slice(0, 8);
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

/** Open5e-v2-Suche über Basisklassen UND Subklassen. ref.url = v2-Key. */
async function searchOpen5eClasses(q: string): Promise<DndApiRef[]> {
  const all = await listClasses();
  const ql = q.toLowerCase();
  return all
    .filter((c) => c.name.toLowerCase().includes(ql))
    .map((c) => ({
      index: c.key,
      name: c.subclass_of?.name ? `${c.name} — Unterklasse von ${c.subclass_of.name}` : c.name,
      url: c.key,
    }))
    .slice(0, 15);
}

async function searchOpen5eSpecies(q: string): Promise<DndApiRef[]> {
  const all = await listSpecies();
  const ql = q.toLowerCase();
  return all
    .filter((s) => s.name.toLowerCase().includes(ql))
    .map((s) => ({ index: s.key, name: s.name, url: s.key }))
    .slice(0, 15);
}

/**
 * Die 2024-Quellen zuerst: nur 4 der ~58 Einträge sind SRD 5.2, der Rest ist
 * 2014-/A5E-Material und landet beim Import als `homebrew-sam`.
 */
async function searchOpen5eBackgrounds(q: string): Promise<DndApiRef[]> {
  const all = await listBackgrounds();
  const ql = q.toLowerCase();
  return all
    .filter((b) => b.name.toLowerCase().includes(ql))
    .sort((a, b) => Number(b.document?.key === DEFAULT_DOCUMENT) - Number(a.document?.key === DEFAULT_DOCUMENT))
    .map((b) => ({ index: b.key, name: `${b.name} (${b.document?.display_name ?? b.document?.key ?? '?'})`, url: b.key }))
    .slice(0, 15);
}

async function searchClassLibrary(q: string): Promise<{ name: string; load: () => Promise<ClassProgression> }[]> {
  const lib = await getClasses();
  return searchClasses(lib, q, 8).map((c) => ({
    name: classDisplayName(c),
    load: async () => {
      const r = parseClass(await readJson(c.path));
      return r.ok ? r.data : blankClass(classDisplayName(c));
    },
  }));
}

async function searchSpeciesLibrary(q: string): Promise<{ name: string; load: () => Promise<Species> }[]> {
  const lib = await getSpeciesList();
  return searchSpecies(lib, q, 8).map((s) => ({
    name: speciesDisplayName(s),
    load: async () => {
      const r = parseSpecies(await readJson(s.path));
      return r.ok ? r.data : blankSpecies(speciesDisplayName(s));
    },
  }));
}

async function searchBackgroundLibrary(q: string): Promise<{ name: string; load: () => Promise<Background> }[]> {
  const lib = await getBackgroundsList();
  return searchBackgrounds(lib, q, 8).map((b) => ({
    name: backgroundDisplayName(b),
    load: async () => {
      const r = parseBackground(await readJson(b.path));
      return r.ok ? r.data : blankBackground(backgroundDisplayName(b));
    },
  }));
}

/** Bindet T an der Definitionsstelle; die Registry selbst ist typunabhängig. */
const spec = <T>(s: CreateSpec<T>): CreateSpec<unknown> => s as CreateSpec<unknown>;

export const CREATE_SPECS = {
  monster: spec<Monster>({
    type: 'monster',
    title: 'Neues Monster',
    searchApi: searchMonsters,
    mapApi: mapApiResourceToMonster,
    searchLibrary: searchMonsterLibrary,
    blank: (name) => ({ ...MONSTER_TEMPLATE, name: name || MONSTER_TEMPLATE.name }),
    buildAction: createMonsterAction,
    nameOf: (m) => m.name || 'Monster',
  }),
  spell: spec<Spell>({
    type: 'spell',
    title: 'Neuer Zauber',
    searchApi: searchOpen5eSpells,
    loadApi: async (ref) => mapOpen5eSpell(await getSpell(ref.url)),
    searchLibrary: searchSpellLibrary,
    blank: blankSpell,
    buildAction: createSpellAction,
    nameOf: (s) => s.name || 'Zauber',
  }),
  item: spec<Item>({
    type: 'item',
    title: 'Neuer Gegenstand',
    searchApi: searchOpen5eItems,
    // Open5e-v2-Item-Key → anpassbare Homebrew-Kopie (nur Ausrüstung).
    loadApi: async (ref) => toHomebrewCopy(mapOpen5eItem(await getOpen5eItem(ref.url))),
    searchLibrary: searchItemLibrary,
    blank: (name) => blankItem(name, loadedItemDirs()[0] ?? 'other'),
    buildAction: createItemAction,
    nameOf: (i) => i.name_de || i.name || 'Gegenstand',
  }),
  class: spec<ClassProgression>({
    type: 'class',
    title: 'Neue Klasse',
    searchApi: searchOpen5eClasses,
    loadApi: async (ref) => mapV2(await getClass(ref.url)),
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
    searchApi: searchOpen5eSpecies,
    loadApi: async (ref) => mapV2Species(await getSpeciesRaw(ref.url)),
    searchLibrary: searchSpeciesLibrary,
    blank: blankSpecies,
    nameOf: (s) => s.nameDe || s.name || 'Spezies',
  }),
  feat: spec({
    type: 'feat',
    title: 'Neues Talent',
    searchApi: searchOpen5eFeats,
    loadApi: loadOpen5eFeat,
    searchLibrary: searchFeatLibrary,
    blank: blankFeat,
    nameOf: featDraftName,
  }),
  background: spec<Background>({
    type: 'background',
    title: 'Neuer Hintergrund',
    searchApi: searchOpen5eBackgrounds,
    loadApi: async (ref) => mapV2Background(await getBackgroundRaw(ref.url)),
    searchLibrary: searchBackgroundLibrary,
    blank: blankBackground,
    nameOf: (b) => b.nameDe || b.name || 'Hintergrund',
  }),
} satisfies Partial<Record<FileEntryType, CreateSpec<unknown>>>;

export type CreateKind = keyof typeof CREATE_SPECS;

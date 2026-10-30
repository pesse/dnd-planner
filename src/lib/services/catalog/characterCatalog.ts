import { invoke } from '@tauri-apps/api/core';
import { CHARACTERS_PATH, characterLabel, listCharacterDirs } from '../characterDirectory';
import { formatClassLevel, formatSpecies, totalLevel } from '../../schemas/classLevelText';
import { parseCharacter } from '../../utils/schemaValidation';
import { resolveCharacterPortrait } from '../characterPortrait.svelte';
import type { Character } from '../../schemas/characterSchema';
import { byLabel, type CatalogCell, type CatalogFacetValue, type CatalogRow, type CatalogSpec } from './catalogTypes';

const NO_CLASS = { id: '', label: 'Ohne Klasse' };

/** TP und RK sind Freitext am Charakter; sortiert wird nach der ersten Zahl darin. */
function numberCell(text: string): CatalogCell {
  const n = Number.parseInt(text, 10);
  return { text, sort: Number.isNaN(n) ? -1 : n };
}

const classFacets = (c: Character): CatalogFacetValue[] =>
  c.classes.filter((k) => k.name.trim()).map((k) => ({ id: k.sourceKey || k.name.trim(), label: k.name.trim() }));

export function characterRow(uid: string, c: Character, portrait: string | null = null): CatalogRow {
  const level = totalLevel(c.classes);
  const species = formatSpecies(c.species) || c.race;
  const primary = classFacets(c)[0] ?? NO_CLASS;
  return {
    path: `${CHARACTERS_PATH}/${uid}/character.json`,
    dirPath: `${CHARACTERS_PATH}/${uid}`,
    entryName: characterLabel({ uid, name: c.name.trim() }),
    name: characterLabel({ uid, name: c.name.trim() }),
    group: primary.id,
    icon: portrait,
    iconColor: 'var(--gold)',
    cells: {
      classLevel: { text: formatClassLevel(c.classes) || c.classLevel },
      level: level ? { text: String(level), sort: level } : { text: '', sort: 0 },
      species: { text: species },
      background: { text: c.backgroundRef?.name || c.background },
      player: { text: c.playerName },
      hp: numberCell(c.hpMax),
      ac: numberCell(c.ac),
    },
    facets: {
      class: classFacets(c),
      species: species ? { id: c.species.sourceKey || species, label: species } : undefined,
    },
  };
}

async function readCharacter(uid: string): Promise<Character | null> {
  try {
    const raw = await invoke<string>('read_file_content', { path: `${CHARACTERS_PATH}/${uid}/character.json` });
    const parsed = parseCharacter(JSON.parse(raw));
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Die Startklasse ist der Filter; Mehrklassen-Charaktere findet zusätzlich die Klassen-Facette. */
export const characterCatalog: CatalogSpec = {
  kind: 'character',
  type: 'character',
  label: 'Charaktere',
  groupLabel: 'Startklasse',
  portraits: true,
  columns: {
    classLevel: { label: 'Klasse', wrap: true },
    level: { label: 'Stufe', numeric: true },
    species: { label: 'Volk' },
    background: { label: 'Hintergrund' },
    player: { label: 'Spieler' },
    hp: { label: 'TP', numeric: true },
    ac: { label: 'RK', numeric: true },
  },
  columnSets: { '': ['classLevel', 'level', 'species', 'background', 'player', 'hp', 'ac'] },
  facets: { class: 'Klasse', species: 'Volk' },
  invalidate: () => {},
  async load() {
    const uids = await listCharacterDirs();
    const rows = (await Promise.all(uids.map(async (uid) => {
      const c = await readCharacter(uid);
      return c ? characterRow(uid, c, await resolveCharacterPortrait(c, `${CHARACTERS_PATH}/${uid}`)) : null;
    }))).filter((r): r is CatalogRow => !!r);
    const groups = new Map(rows.map((r) => [r.group, (r.facets.class as CatalogFacetValue[])[0] ?? NO_CLASS]));
    return { rows, groups: [...groups.values()].sort(byLabel) };
  },
};

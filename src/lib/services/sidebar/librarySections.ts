/**
 * Die flachen Regel-Bibliotheken der Seitenleiste. Ein Eintrag beschreibt eine
 * Sektion vollständig; das Auf-/Zuklappen, Öffnen und Löschen liegt in
 * `SidebarSection.svelte`.
 */
import { getClassTree, classDisplayName } from '../../classLibrary';
import { getSpeciesList, speciesDisplayName } from '../../speciesLibrary';
import { getFeats, featDisplayName } from '../../featsLibrary';
import { getBackgroundsList, backgroundDisplayName } from '../../backgroundsLibrary';
import type { FileEntry } from '../../types';
import type { CreateKind } from './createSpecs';

/** Ein Bibliothekseintrag; `children` trägt die Unterklassen einer Basisklasse. */
export interface LibraryEntry {
  name: string;
  path?: string;
  children?: LibraryEntry[];
}

export interface LibrarySection {
  kind: CreateKind;
  type: FileEntry['type'];
  label: string;
  addTitle: string;
  emptyLabel: string;
  icon: string;
  load: () => Promise<LibraryEntry[]>;
}

export const LIBRARY_SECTIONS: LibrarySection[] = [
  {
    kind: 'class', type: 'class', label: 'Klassen', addTitle: 'Neue Klasse',
    emptyLabel: 'Keine Klassen', icon: '📖',
    load: async () =>
      (await getClassTree()).map((node) => ({
        name: classDisplayName(node),
        path: node.path,
        children: node.subclasses.map((sub) => ({ name: classDisplayName(sub), path: sub.path })),
      })),
  },
  {
    kind: 'species', type: 'species', label: 'Spezies', addTitle: 'Neue Spezies',
    emptyLabel: 'Keine Spezies', icon: '🧬',
    load: async () =>
      (await getSpeciesList()).map((info) => ({ name: speciesDisplayName(info), path: info.path })),
  },
  {
    kind: 'feat', type: 'feat', label: 'Talente', addTitle: 'Neues Talent',
    emptyLabel: 'Keine Talente', icon: '✴',
    load: async () =>
      (await getFeats()).map((info) => ({ name: featDisplayName(info), path: info.path })),
  },
  {
    kind: 'background', type: 'background', label: 'Hintergründe', addTitle: 'Neuer Hintergrund',
    emptyLabel: 'Keine Hintergründe', icon: '🎭',
    load: async () =>
      (await getBackgroundsList()).map((info) => ({ name: backgroundDisplayName(info), path: info.path })),
  },
];

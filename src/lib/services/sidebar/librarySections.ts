/**
 * Die flachen Regel-Bibliotheken der Seitenleiste. Ein Eintrag beschreibt eine
 * Sektion vollständig; das Auf-/Zuklappen, Öffnen und Löschen liegt in
 * `SidebarSection.svelte`.
 */
import { getClassTree, classDisplayName } from '../../classLibrary';
import { getSpeciesList, speciesDisplayName } from '../../speciesLibrary';
import { getBackgroundsList, backgroundDisplayName } from '../../backgroundsLibrary';
import type { FileEntry } from '../../types';
import type { CreateKind } from './createSpecs';
import type { CatalogKind } from '../catalog/catalogTypes';

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
  /** Klick aufs Label öffnet die Katalog-Übersicht; der Pfeil klappt weiter auf. */
  catalog: CatalogKind;
  load: () => Promise<LibraryEntry[]>;
}

export const LIBRARY_SECTIONS: LibrarySection[] = [
  {
    kind: 'class', type: 'class', label: 'Klassen', addTitle: 'Neue Klasse',
    emptyLabel: 'Keine Klassen', icon: '📖', catalog: 'class',
    load: async () =>
      (await getClassTree()).map((node) => ({
        name: classDisplayName(node),
        path: node.path,
        children: node.subclasses.map((sub) => ({ name: classDisplayName(sub), path: sub.path })),
      })),
  },
  {
    kind: 'species', type: 'species', label: 'Spezies', addTitle: 'Neue Spezies',
    emptyLabel: 'Keine Spezies', icon: '🧬', catalog: 'species',
    load: async () =>
      (await getSpeciesList()).map((info) => ({ name: speciesDisplayName(info), path: info.path })),
  },
  {
    kind: 'background', type: 'background', label: 'Hintergründe', addTitle: 'Neuer Hintergrund',
    emptyLabel: 'Keine Hintergründe', icon: '🎭', catalog: 'background',
    load: async () =>
      (await getBackgroundsList()).map((info) => ({ name: backgroundDisplayName(info), path: info.path })),
  },
];

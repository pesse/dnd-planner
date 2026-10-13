/**
 * Startausrüstung aus Klasse und Hintergrund: je Herkunft eine Wahlgruppe aus der
 * Deklaration `startingEquipmentOptions`, die Prosa nur als Anzeige daneben.
 */
import { getProgressionByKey } from '../classProgression';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getItemsByDir, buildItemIndex, displayName, type ItemIndex } from '$lib/itemLibrary';
import type { StartingEquipmentOption, StartingItem } from '$lib/schemas/startingEquipment';

const EQUIPMENT_CANDIDATE_DIRS = [
  'weapon', 'armor', 'shield', 'ammunition', 'adventuring-gear',
  'equipment-pack', 'tools', 'spellcasting-focus',
];

export interface EquipmentGroup {
  source: 'Klasse' | 'Hintergrund';
  prose: string;
  /** Leer = die Herkunft deklariert nichts; der Wizard zeigt nur die Prosa. */
  options: StartingEquipmentOption[];
}

export async function gatherStartingEquipment(classKey: string, backgroundKey: string): Promise<EquipmentGroup[]> {
  const [prog, bg] = await Promise.all([
    classKey ? getProgressionByKey(classKey) : Promise.resolve(null),
    backgroundKey ? getBackgroundByKey(backgroundKey) : Promise.resolve(null),
  ]);
  const bgEquip = bg?.benefits.find((b) => b.type === 'equipment');
  const groups: EquipmentGroup[] = [
    {
      source: 'Klasse',
      prose: (prog?.startingEquipmentDe || prog?.startingEquipment || '').trim(),
      options: prog?.startingEquipmentOptions ?? [],
    },
    {
      source: 'Hintergrund',
      prose: (bgEquip?.descDe || bgEquip?.desc || '').trim(),
      options: bg?.startingEquipmentOptions ?? [],
    },
  ];
  return groups.filter((g) => g.options.length || g.prose);
}

export async function equipmentIndex(): Promise<ItemIndex> {
  // Eine im Vault fehlende Kategorie bleibt leer statt zu werfen — `shield` etwa ist eine
  // Open5e-Kategorie, die SRD-Schilde liegen unter `armor`.
  const lists = await Promise.all(EQUIPMENT_CANDIDATE_DIRS.map((dir) => getItemsByDir(dir).catch(() => [])));
  return buildItemIndex(Object.fromEntries(EQUIPMENT_CANDIDATE_DIRS.map((dir, i) => [dir, lists[i]])));
}

/** „Buch (Gebete)“ — fehlt der Gegenstand in der Bibliothek, steht der Key da. */
export function startingItemName(index: ItemIndex | null, item: Pick<StartingItem, 'itemKey' | 'noteDe'>): string {
  const lib = index?.byKey.get(item.itemKey);
  const base = lib ? displayName(lib) : item.itemKey;
  return item.noteDe ? `${base} (${item.noteDe})` : base;
}

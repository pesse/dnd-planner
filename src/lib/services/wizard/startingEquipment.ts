/**
 * Startausrüstungs-PROSA aus Klasse und Hintergrund. Bewusst KEIN Prosa-Parser: der Nutzer
 * entscheidet an der angezeigten Prosa, das Matching gegen die Item-Bibliothek macht danach
 * `equipmentMatchAction.ts`.
 */
import { getProgressionByKey } from '../classProgression';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getItemsByDir, displayName as itemDisplayName, buildItemIndex, type ItemIndex } from '$lib/itemLibrary';

const EQUIPMENT_CANDIDATE_DIRS = [
  'weapon', 'armor', 'shield', 'ammunition', 'adventuring-gear',
  'equipment-pack', 'tools', 'spellcasting-focus',
];

export interface StartingEquipmentSources {
  classProse: string;
  backgroundProse: string;
}

/** Eine nicht auflösbare Quelle bleibt leer — der Wizard zeigt nur, was da ist, statt zu raten. */
export async function gatherStartingEquipment(
  classKey: string,
  backgroundKey: string,
): Promise<StartingEquipmentSources> {
  const [prog, bg] = await Promise.all([
    classKey ? getProgressionByKey(classKey) : Promise.resolve(null),
    backgroundKey ? getBackgroundByKey(backgroundKey) : Promise.resolve(null),
  ]);
  // Deutsche Fassung bevorzugen: sonst übersetzt die Matching-KI die englische Prosa
  // erneut on-the-fly und trifft die Bibliotheks-Namen nicht (aus „Beil" würde „Wurfaxt").
  const bgEquip = bg?.benefits.find((b) => b.type === 'equipment');
  return {
    classProse: (prog?.startingEquipmentDe || prog?.startingEquipment || '').trim(),
    backgroundProse: (bgEquip?.descDe || bgEquip?.desc || '').trim(),
  };
}

export async function equipmentCandidateNames(): Promise<string[]> {
  const lists = await loadCandidates();
  return [...new Set(lists.flat().map((i) => itemDisplayName(i)))];
}

export async function equipmentIndex(): Promise<ItemIndex> {
  const lists = await loadCandidates();
  return buildItemIndex(Object.fromEntries(EQUIPMENT_CANDIDATE_DIRS.map((dir, i) => [dir, lists[i]])));
}

// Eine im Vault fehlende Kategorie bleibt leer statt zu werfen — `shield` etwa ist eine
// Open5e-Kategorie, die SRD-Schilde liegen unter `armor`.
function loadCandidates() {
  return Promise.all(EQUIPMENT_CANDIDATE_DIRS.map((dir) => getItemsByDir(dir).catch(() => [])));
}

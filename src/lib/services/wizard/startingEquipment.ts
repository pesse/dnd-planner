/**
 * Sammelt die Startausrüstungs-PROSA aus Klasse und Hintergrund für Schritt 6 des
 * Wizards. Bewusst KEIN Prosa-Parser: die Klassen-Kerntabelle führt die Ausrüstung
 * als Fließtext („Choose (A) … or (B) 155 GP"), der Hintergrund als
 * `equipment`-Vorteil. Der Nutzer trifft die Entscheidung (Option A/B bzw. Gold)
 * an der angezeigten Prosa; das anschließende Matching gegen die Item-Bibliothek
 * übernimmt eine thinking-freie KI-Funktion (`equipmentMatchAction.ts`).
 *
 * Dieselben Kategorien liefern die Match-Kandidaten für die KI und die Gewichte fürs
 * Inventar — sie stehen deshalb hier und nicht doppelt in Wizard und Assembly. Fehlt
 * eine Kategorie im Vault (`shield` ist eine Open5e-Kategorie, die SRD-Schilde liegen
 * aber unter `armor`), bleibt sie leer statt zu werfen.
 */
import { getProgressionByKey } from '../classProgression';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getItemsByDir, displayName as itemDisplayName, buildItemIndex, type ItemIndex } from '$lib/itemLibrary';

const EQUIPMENT_CANDIDATE_DIRS = [
  'weapon', 'armor', 'shield', 'ammunition', 'adventuring-gear',
  'equipment-pack', 'tools', 'spellcasting-focus',
];

export interface StartingEquipmentSources {
  /** Startausrüstungs-Prosa der Startklasse (leer, wenn nicht auflösbar). */
  classProse: string;
  /** Ausrüstungs-Vorteil des Hintergrunds als Prosa (leer, wenn keiner). */
  backgroundProse: string;
}

/**
 * Holt die beiden Prosa-Quellen aus der lokalen Bibliothek. Fehlt eine Quelle
 * (Link nicht auflösbar), bleibt ihr Feld leer — der Wizard zeigt dann nur, was da
 * ist, statt zu raten.
 */
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

/** Alle Item-Namen, an denen sich die Matching-KI orientieren soll (dedupliziert). */
export async function equipmentCandidateNames(): Promise<string[]> {
  const lists = await loadCandidates();
  return [...new Set(lists.flat().map((i) => itemDisplayName(i)))];
}

/** Index über dieselben Kategorien: Link und Gewicht kommen aus einem Treffer. */
export async function equipmentIndex(): Promise<ItemIndex> {
  const lists = await loadCandidates();
  return buildItemIndex(Object.fromEntries(EQUIPMENT_CANDIDATE_DIRS.map((dir, i) => [dir, lists[i]])));
}

function loadCandidates() {
  return Promise.all(EQUIPMENT_CANDIDATE_DIRS.map((dir) => getItemsByDir(dir).catch(() => [])));
}

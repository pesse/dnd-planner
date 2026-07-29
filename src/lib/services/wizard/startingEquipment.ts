/**
 * Sammelt die Startausrüstungs-PROSA aus Klasse und Hintergrund für Schritt 6 des
 * Wizards. Bewusst KEIN Prosa-Parser: die Klassen-Kerntabelle führt die Ausrüstung
 * als Fließtext („Choose (A) … or (B) 155 GP"), der Hintergrund als
 * `equipment`-Vorteil. Der Nutzer trifft die Entscheidung (Option A/B bzw. Gold)
 * an der angezeigten Prosa; das anschließende Matching gegen die Item-Bibliothek
 * übernimmt eine thinking-freie KI-Funktion (`equipmentMatchAction.ts`).
 *
 * `splitOptions` ist eine tolerante Anzeige-Hilfe: erkennt sie ein „(A)/(B)"-Muster,
 * bietet der Wizard Radio-Optionen an, sonst genau eine (die ganze Prosa).
 */
import { getProgressionByKey } from '../classProgression';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';

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

/**
 * Zerlegt eine Ausrüstungs-Prosa tolerant in wählbare Optionen, wenn ein
 * „(A) … or (B) …"-Muster erkennbar ist. Ohne erkennbares Muster ist die ganze
 * Prosa die einzige Option. Leerer Text → keine Optionen.
 */
export function splitOptions(prose: string): string[] {
  const text = prose.trim();
  if (!text) return [];
  // An Options-Markern „(A)", „(B)", … trennen; der einleitende „Choose one:"-Teil
  // vor dem ersten Marker fällt weg.
  const parts = text.split(/\((?=[A-Z]\))/).map((p) => p.replace(/^[A-Z]\)\s*/, '').trim());
  const options = parts.filter((p, i) => p && !(i === 0 && !/[A-Z]\)/.test(text.slice(0, text.indexOf(p)))));
  const cleaned = options.filter(Boolean);
  return cleaned.length >= 2 ? cleaned : [text];
}

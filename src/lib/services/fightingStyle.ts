/**
 * Kampfstil (Fighting Style, 5e 2024): welche Kampfstil-Talente ein Charakter wählen darf
 * und wie viele. Exaktes Gegenstück zu `weaponMastery.ts` — dieselbe Bauform: eine SCHMALE
 * Eingabe (Klassen-Links) statt des ganzen Charakters, ein reines ANGEBOT statt stiller
 * Änderungen, Optionen aus der BIBLIOTHEK statt aus der KI.
 *
 * Der Unterschied zur Waffenbeherrschung liegt allein in der Speicherung: ein Kampfstil ist
 * ein echtes Talent mit eigener Mechanik (z.B. Verteidigung = +1 RK), also ein Talent-LINK
 * in `character.features[]` (sourceKey = Talent-Key) — nicht ein bloßer Name in einem
 * String-Array wie bei den Waffen. Kontingent-Quelle (Vault) und Halluzinationsschutz
 * (`isFlowOwnedChoiceFeature`) sind identisch.
 *
 * Welche Merkmale einen Kampfstil gewähren, steht DEKLARATIV am Klassenmerkmal
 * (`grantsChoice.kind === 'featCategory'`, featCategory === 'Fighting Style'), nicht an einer
 * Namensliste — so gewährt eine Homebrew-Klasse denselben Wahl-Schritt, indem sie das Feld
 * setzt.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { FeatCategory } from '$lib/schemas/shared';
import { featuresUpTo, getProgressionByKey } from './classProgression';
import { getFeats, featDisplayName, featDesc, featPrereq } from '$lib/featsLibrary';

/** Die Talent-Kategorie, aus der Kampfstile stammen. */
const FIGHTING_STYLE_CATEGORY: FeatCategory = 'Fighting Style';

/**
 * Gewährt dieses Merkmal eine Kampfstil-Wahl? Rein deklarativ — kein Namensvergleich, damit
 * eine Homebrew-Klasse mit derselben `grantsChoice`-Deklaration genauso behandelt wird.
 */
export function isFightingStyleFeature(f: ClassFeature): boolean {
  return f.grantsChoice?.kind === 'featCategory' && f.grantsChoice.featCategory === FIGHTING_STYLE_CATEGORY;
}

/** Ein wählbarer Kampfstil: Bibliotheks-Talent der Kategorie „Fighting Style". */
export interface FightingStyleOption {
  /** Talent-Key (landet als `sourceKey` im Merkmals-Ledger des Charakters). */
  sourceKey: string;
  /** Anzeigename (deutsch, falls vorhanden). */
  name: string;
  /** Beschreibung (deutsch zuerst) — Tooltip. */
  desc: string;
}

/**
 * Was `fightingStyleOffer` braucht: die Klassen-Links (inkl. Subklasse, weil der
 * „Zusätzliche Kampfstil" des Champions ein Subklassen-Merkmal ist). Ein `Character`
 * erfüllt das strukturell (wie bei `MasteryInput`).
 */
export interface FightingStyleInput {
  classes?: { sourceKey?: string; subclassKey?: string; name?: string; level?: number }[];
}

export interface FightingStyleOffer {
  /** Zahl der wählbaren Kampfstile; 0 = keine Klasse gewährt einen. */
  allowance: number;
  /** Anzeigename der gewährenden Klasse(n) („Kämpfer", bei Multiclass „Kämpfer / Paladin"). */
  className: string;
  /** Wählbare Kampfstil-Talente aus der Bibliothek, alphabetisch. */
  options: FightingStyleOption[];
}

const emptyOffer = (): FightingStyleOffer => ({ allowance: 0, className: '', options: [] });

/** Summe der Kampfstil-Kontingente einer Progression bis `level` (0 = gewährt keinen). */
function styleCountUpTo(prog: ClassProgression, level: number): number {
  return featuresUpTo(prog, level)
    .filter(isFightingStyleFeature)
    .reduce((sum, f) => sum + (f.grantsChoice?.count ?? 1), 0);
}

/**
 * Kontingent + Auswahlmenge für einen Charakter.
 *
 * ANDERS als bei der Waffenbeherrschung zählt hier NICHT nur `classes[0]`: einen Kampfstil
 * gewährt jede Klasse eigenständig (Kämpfer, Paladin, Waldläufer), also summiert das
 * Kontingent über alle Klassen — inklusive der jeweiligen Subklasse (Champion Stufe 7). Die
 * Optionsliste ist bewusst NICHT gefiltert: ein Kampfstil hat keine Übungs-Voraussetzung, die
 * der Charakter erst erfüllen müsste. Doppelte Stile verhindert der Picker (man kann einen
 * Kampfstil nicht zweimal nehmen).
 */
export async function fightingStyleOffer(input: FightingStyleInput): Promise<FightingStyleOffer> {
  const classes = input.classes?.filter((c) => c?.sourceKey) ?? [];
  if (!classes.length) return emptyOffer();

  let allowance = 0;
  const classNames: string[] = [];
  for (const c of classes) {
    const level = Math.min(20, Math.max(1, c.level ?? 1));
    const [prog, subProg] = await Promise.all([
      getProgressionByKey(c.sourceKey!),
      c.subclassKey ? getProgressionByKey(c.subclassKey) : Promise.resolve(null),
    ]);
    if (!prog) continue;
    const n = styleCountUpTo(prog, level) + (subProg ? styleCountUpTo(subProg, level) : 0);
    if (n > 0) {
      allowance += n;
      const label = c.name?.trim() || prog.nameDe || prog.name;
      if (label && !classNames.includes(label)) classNames.push(label);
    }
  }
  if (allowance <= 0) return emptyOffer();

  const options: FightingStyleOption[] = (await getFeats())
    .filter((f) => f.category === FIGHTING_STYLE_CATEGORY && f.sourceKey)
    .map((f) => ({ sourceKey: f.sourceKey!, name: featDisplayName(f), desc: featDesc(f) || featPrereq(f) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return { allowance, className: classNames.join(' / '), options };
}

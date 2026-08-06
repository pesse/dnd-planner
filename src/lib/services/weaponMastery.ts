/**
 * Waffenbeherrschung: wie viele Waffenarten wählbar sind und welche. Ein reines ANGEBOT auf
 * schmaler Eingabe, wie `proficiencyGrants.ts`. KEIN KI-Pfad — ein Modell könnte hier nur
 * Waffen erfinden; die Eigenschaft selbst hängt am Item (`item.mastery`), nicht hier.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { WeaponMastery } from '$lib/schemas/vocabulary';
import { columnValue, featuresUpTo, getProgressionByKey } from './classProgression';
import { choiceGrants } from './declaration/source';
import { isProficientWithWeapon, type WeaponProficiencies } from './weaponProficiency';
import { getItemsByDir, displayName, type ItemInfo } from '$lib/itemLibrary';

/** Name der Tabellenspalte in Open5e v2 (Barbar/Kämpfer haben sie, die übrigen drei nicht). */
const MASTERY_COLUMN = 'Weapon Mastery';

/** Kontingent, wenn das Merkmal da ist, aber keine Tabellenspalte (Paladin/Schurke/Waldläufer). */
const MASTERY_DEFAULT = 2;

/**
 * Deklariert das Merkmal eine ANDERE Wahl (Kampfstil), ist es ausdrücklich keine
 * Waffenbeherrschung. Die Namensheuristik ist nur der Fallback für ungepflegte Merkmale und
 * bewusst eng gebunden — `mastery` allein träfe auch andere.
 */
export function isWeaponMasteryFeature(f: ClassFeature): boolean {
  if (f.grantsChoice) return choiceGrants(f).some((g) => g.kind === 'weaponMastery');
  return (
    /weapon[-\s]?mastery/i.test(f.key ?? '') ||
    /\bweapon mastery\b/i.test(f.name) ||
    /\bwaffen(?:meister|beherr)schaft\b/i.test(f.nameDe ?? '')
  );
}

function masteryFeatureUpTo(prog: ClassProgression, level: number): ClassFeature | undefined {
  return featuresUpTo(prog, level).find(isWeaponMasteryFeature);
}

/**
 * Paladin, Schurke und Waldläufer emittiert Open5e ohne die Spalte, obwohl sie das Merkmal
 * tragen — dort gilt der konstante SRD-Wert. Ohne Merkmal UND ohne Spalte: 0.
 */
export function masteryAllowanceFor(prog: ClassProgression, level: number): number {
  const raw = columnValue(prog, MASTERY_COLUMN, level);
  const fromColumn = Number(String(raw ?? '').match(/(\d+)/)?.[1] ?? 0);
  if (fromColumn > 0) return fromColumn;
  return masteryFeatureUpTo(prog, level) ? MASTERY_DEFAULT : 0;
}

/**
 * Am Merkmalstext abgelesen statt am Klassen-Key, damit eine Homebrew-Klasse mit derselben
 * Formulierung („Melee weapons", nur der Barbar) genauso behandelt wird.
 */
function isMeleeOnly(f: ClassFeature | undefined): boolean {
  return /\bmelee\b/i.test(f?.desc ?? '') || /\bnahkampf/i.test(f?.descDe ?? '');
}

export type MasteryWeapon = ItemInfo & { mastery: WeaponMastery };

/**
 * Der Anzeigename wie bei `inventory[].name` — nur so greift die Auflösung über `itemByName`
 * im Bogen ohne zweiten Mechanismus.
 */
export const masteryName = (item: ItemInfo): string => displayName(item);

/** Ein `Character` erfüllt das strukturell (wie bei `GrantInput`). */
export interface MasteryInput {
  classes?: { sourceKey?: string; name?: string; level?: number }[];
  proficiencies?: WeaponProficiencies;
}

export interface MasteryOffer {
  /** 0 = die Klasse kennt Waffenbeherrschung nicht. */
  allowance: number;
  className: string;
  meleeOnly: boolean;
  weapons: MasteryWeapon[];
}

const emptyOffer = (): MasteryOffer => ({ allowance: 0, className: '', meleeOnly: false, weapons: [] });

/**
 * **Nur `classes[0]` zählt** — bei Klassenkombination wird Waffenbeherrschung nicht erneut
 * gewährt. Gefiltert wird über die ÜBUNGEN des Charakters (`isProficientWithWeapon`), nicht
 * über die Grants: was am Charakter steht, ist die Wahrheit — wer „Kriegswaffen" abwählt,
 * verliert sie aus der Auswahl, behält aber die einzeln erklärten.
 */
export async function masteryOffer(input: MasteryInput): Promise<MasteryOffer> {
  const first = input.classes?.[0];
  if (!first?.sourceKey) return emptyOffer();

  const prog = await getProgressionByKey(first.sourceKey);
  if (!prog) return emptyOffer();

  const level = Math.min(20, Math.max(1, first.level ?? 1));
  const allowance = masteryAllowanceFor(prog, level);
  if (allowance <= 0) return emptyOffer();

  const meleeOnly = isMeleeOnly(masteryFeatureUpTo(prog, level));

  const all = await getItemsByDir('weapon');
  const byName = (n: string): ItemInfo | undefined => {
    const q = n.trim().toLowerCase();
    return all.find((w) => displayName(w).toLowerCase() === q || w.name.toLowerCase() === q);
  };

  // Ohne `weapon_category` gegen kein Häkchen prüfbar — die Waffe fällt heraus, es sei denn
  // sie ist einzeln erklärt: dann ist die Kategorie für die Übung ohnehin nicht die Quelle.
  const weapons = all
    .filter((w): w is MasteryWeapon => Boolean(w.mastery))
    // Magische Stücke deckt die Basisart über `index` mit ab (`coversWeapon`).
    .filter((w) => !w.magic)
    .filter((w) => isProficientWithWeapon(input.proficiencies, w, byName))
    // Klassen-, keine Übungsbeschränkung: liegt deshalb ÜBER der Einzelnennung.
    .filter((w) => !meleeOnly || /^melee$/i.test(w.weapon_range ?? ''))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'));

  return {
    allowance,
    className: first.name?.trim() || prog.nameDe || prog.name,
    meleeOnly,
    weapons,
  };
}

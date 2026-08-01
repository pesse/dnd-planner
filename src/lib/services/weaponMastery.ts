/**
 * Waffenbeherrschung: wie viele Waffenarten wählbar sind und welche. Ein reines ANGEBOT auf
 * schmaler Eingabe, wie `proficiencyGrants.ts`. KEIN KI-Pfad — ein Modell könnte hier nur
 * Waffen erfinden; die Eigenschaft selbst hängt am Item (`item.mastery`), nicht hier.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { WeaponMastery } from '$lib/schemas/vocabulary';
import { columnValue, featuresUpTo, getProgressionByKey } from './classProgression';
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
  if (f.grantsChoice) return f.grantsChoice.kind === 'weaponMastery';
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

const normName = (s: string): string => s.trim().toLowerCase();

export interface MasteredKinds {
  names: Set<string>;
  indexes: Set<string>;
}

/**
 * Der `index` ist der Zweck: gewählt werden nur Basisarten, beherrscht ist damit auch jedes
 * magische Stück derselben Art.
 */
export function masteredKinds(
  masteries: readonly string[],
  byName: (name: string) => { index?: string } | undefined,
): MasteredKinds {
  const kinds: MasteredKinds = { names: new Set(), indexes: new Set() };
  for (const m of masteries) {
    kinds.names.add(normName(m));
    const index = byName(m)?.index;
    if (index) kinds.indexes.add(index);
  }
  return kinds;
}

/**
 * Beide Namensseiten, weil ein Angriff im Bogen deutsch oder englisch geführt sein kann —
 * dieselbe Unschärfe wie beim Inventar, aber an EINER Stelle behandelt.
 */
export function isMastered(kinds: MasteredKinds, item: { name: string; name_de?: string; index?: string }): boolean {
  return (
    (!!item.index && kinds.indexes.has(item.index)) ||
    kinds.names.has(normName(item.name)) ||
    (!!item.name_de && kinds.names.has(normName(item.name_de)))
  );
}

/** Ein `Character` erfüllt das strukturell (wie bei `GrantInput`). */
export interface MasteryInput {
  classes?: { sourceKey?: string; name?: string; level?: number }[];
  proficiencies?: { simpleWeapons?: boolean; martialWeapons?: boolean };
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
 * gewährt. Gefiltert wird über die HÄKCHEN des Charakters, nicht über die Grants: die
 * Häkchen sind die Wahrheit, wer „Kriegswaffen" abwählt, verliert sie aus der Auswahl.
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
  const simple = input.proficiencies?.simpleWeapons ?? false;
  const martial = input.proficiencies?.martialWeapons ?? false;

  // Ohne `weapon_category` gegen kein Häkchen prüfbar — die Waffe fällt heraus.
  const weapons = (await getItemsByDir('weapon'))
    .filter((w): w is MasteryWeapon => Boolean(w.mastery))
    // Magische Stücke deckt die Basisart über `index` mit ab (`isMastered`).
    .filter((w) => !w.magic)
    .filter((w) => (w.weapon_category === 'Simple' && simple) || (w.weapon_category === 'Martial' && martial))
    .filter((w) => !meleeOnly || /^melee$/i.test(w.weapon_range ?? ''))
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'));

  return {
    allowance,
    className: first.name?.trim() || prog.nameDe || prog.name,
    meleeOnly,
    weapons,
  };
}

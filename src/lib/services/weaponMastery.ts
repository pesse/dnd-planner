/**
 * Waffenbeherrschung (Weapon Mastery, 5e 2024): wie viele Waffenarten ein Charakter
 * wählen darf und welche überhaupt zur Wahl stehen.
 *
 * Vorbild und Nachbar ist `proficiencyGrants.ts` — dieselbe Bauform: eine SCHMALE
 * Eingabe statt des ganzen Charakters, damit der Editor sie aus seinem lokalen
 * `$state` bilden kann, und ein reines ANGEBOT statt stiller Änderungen. Die Wahl
 * selbst ist deterministisch und jederzeit editierbar (das deckt die Regel „nach
 * jeder langen Rast tauschbar" ab, ohne eine Rast-Mechanik zu brauchen).
 *
 * Zwei Dinge bewusst NICHT hier:
 *   - Die Eigenschaft einer Waffe. Die hängt an der Waffenart, also am Item
 *     (`item.mastery`) — es gibt keine Waffenarten-Tabelle im Code.
 *   - Eine KI-Schicht. Die Optionsliste kommt aus der Bibliothek; ein LLM könnte
 *     hier nur Waffen erfinden, die der Vault nicht kennt.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { WeaponMastery } from '$lib/schemas/shared';
import { columnValue, featuresUpTo, getProgressionByKey } from './classProgression';
import { getItemsByDir, displayName, type ItemInfo } from '$lib/itemLibrary';

/** Name der Tabellenspalte in Open5e v2 (Barbar/Kämpfer haben sie, die übrigen drei nicht). */
const MASTERY_COLUMN = 'Weapon Mastery';

/** Kontingent, wenn das Merkmal da ist, aber keine Tabellenspalte (Paladin/Schurke/Waldläufer). */
const MASTERY_DEFAULT = 2;

/**
 * Ist dies das Merkmal „Waffenbeherrschung"? Bewusst ENG gebunden — `mastery` allein
 * würde auch andere Merkmale treffen (dieselbe Warnung wie bei
 * `isFlowOwnedChoiceFeature`, services/levelUp.ts).
 */
export function isWeaponMasteryFeature(f: ClassFeature): boolean {
  return (
    /weapon[-\s]?mastery/i.test(f.key ?? '') ||
    /\bweapon mastery\b/i.test(f.name) ||
    /\bwaffen(?:meister|beherr)schaft\b/i.test(f.nameDe ?? '')
  );
}

/** Das Merkmal „Waffenbeherrschung", falls die Klasse es bis `level` gewährt. */
function masteryFeatureUpTo(prog: ClassProgression, level: number): ClassFeature | undefined {
  return featuresUpTo(prog, level).find(isWeaponMasteryFeature);
}

/**
 * Wie viele Waffenarten diese Klasse auf dieser Stufe zulässt. 0 = die Klasse hat
 * Waffenbeherrschung nicht (Panel bleibt aus).
 *
 * Erste Quelle ist die Tabellenspalte (Barbar 2/3/4, Kämpfer 3/4/5/6). Paladin,
 * Schurke und Waldläufer emittiert Open5e ohne die Spalte, obwohl sie das Merkmal
 * tragen — dort gilt der konstante SRD-Wert 2. Ohne Merkmal UND ohne Spalte: 0.
 */
export function masteryAllowanceFor(prog: ClassProgression, level: number): number {
  const raw = columnValue(prog, MASTERY_COLUMN, level);
  const fromColumn = Number(String(raw ?? '').match(/(\d+)/)?.[1] ?? 0);
  if (fromColumn > 0) return fromColumn;
  return masteryFeatureUpTo(prog, level) ? MASTERY_DEFAULT : 0;
}

/**
 * Beschränkt die Klasse ihre Wahl auf Nahkampfwaffen? Nur der Barbar tut das
 * („Simple or Martial **Melee** weapons", SRD S. 34) — abgelesen am Merkmalstext
 * statt am Klassen-Key, damit eine Homebrew-Klasse mit derselben Formulierung
 * genauso behandelt wird.
 */
function isMeleeOnly(f: ClassFeature | undefined): boolean {
  return /\bmelee\b/i.test(f?.desc ?? '') || /\bnahkampf/i.test(f?.descDe ?? '');
}

/** Eine wählbare Waffe: Bibliotheks-Eintrag mit gesetzter Eigenschaft. */
export type MasteryWeapon = ItemInfo & { mastery: WeaponMastery };

/**
 * Der Name, unter dem eine Waffe in `character.masteries` landet: der Anzeigename
 * (deutsch, falls vorhanden) — genau wie bei `inventory[].name`. Damit greift die
 * bestehende Auflösung über `itemByName` im Bogen ohne zweiten Mechanismus.
 */
export const masteryName = (item: ItemInfo): string => displayName(item);

const normName = (s: string): string => s.trim().toLowerCase();

export interface MasteredKinds {
  names: Set<string>;
  indexes: Set<string>;
}

/**
 * Löst die gespeicherten Namen zu Waffenarten auf. Der `index` ist der Grund dafür:
 * die Auswahl bietet nur Basisarten an, beherrscht ist damit auch jedes magische
 * Stück derselben Art.
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
 * Prüft neben der Art beide Namensseiten, weil ein Angriff im Bogen unter der
 * deutschen oder der englischen geführt sein kann — dieselbe Unschärfe wie beim
 * Inventar, aber an EINER Stelle behandelt.
 */
export function isMastered(kinds: MasteredKinds, item: { name: string; name_de?: string; index?: string }): boolean {
  return (
    (!!item.index && kinds.indexes.has(item.index)) ||
    kinds.names.has(normName(item.name)) ||
    (!!item.name_de && kinds.names.has(normName(item.name_de)))
  );
}

/**
 * Was `masteryOffer` braucht: die Klassen-Links plus die zwei Waffen-Häkchen.
 * Ein `Character` erfüllt das strukturell (wie bei `GrantInput`).
 */
export interface MasteryInput {
  classes?: { sourceKey?: string; name?: string; level?: number }[];
  proficiencies?: { simpleWeapons?: boolean; martialWeapons?: boolean };
}

export interface MasteryOffer {
  /** Zahl der wählbaren Waffenarten; 0 = die Klasse kennt Waffenbeherrschung nicht. */
  allowance: number;
  /** Anzeigename der Klasse, die das Kontingent stellt („Kämpfer"). */
  className: string;
  /** true = nur Nahkampfwaffen (Barbar). */
  meleeOnly: boolean;
  /** Wählbare Waffen aus der Bibliothek, alphabetisch. */
  weapons: MasteryWeapon[];
}

const emptyOffer = (): MasteryOffer => ({ allowance: 0, className: '', meleeOnly: false, weapons: [] });

/**
 * Kontingent + Auswahlmenge für einen Charakter.
 *
 * **Nur `classes[0]` zählt.** Waffenbeherrschung wird bei Klassenkombination nicht
 * erneut gewährt, also stellt die Startklasse das Kontingent — auch dann, wenn eine
 * Zweitklasse das Merkmal ebenfalls hätte.
 *
 * Gefiltert wird über die HÄKCHEN des Charakters, nicht über die Grants: die Häkchen
 * sind die Wahrheit (Doktrin des Grant-Panels, CharacterEditForm.svelte). Wer
 * „Kriegswaffen" abwählt, verliert die Kriegswaffen sofort aus der Auswahl.
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

  // Eine Waffe ohne `weapon_category` lässt sich gegen kein Häkchen prüfen und fällt
  // deshalb heraus (Pflege-Lücke im Vault) — das Panel weist auf zu wenig Auswahl hin.
  const weapons = (await getItemsByDir('weapon'))
    .filter((w): w is MasteryWeapon => Boolean(w.mastery))
    // Gewählt wird die Waffenart, nicht das Einzelstück — magische Waffen deckt die
    // Basisart über `index` mit ab (`isMastered`).
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

/**
 * Die EINE Stelle, die sagt, was an einem Charakter noch mit der Bibliothek verknüpfbar
 * ist — kein `CHARACTER_UPGRADES`-Schritt, dessen `apply` ist synchron und käme an die
 * Bibliothek nicht heran. `apply` mutiert die Formular-Objekte in place; den UI-Nachlauf
 * (Anzeige-Spiegel, offene Picker) macht der Aufrufer.
 */
import { classDisplayName, type ClassInfo } from '$lib/classLibrary';
import { speciesDisplayName, type SpeciesInfo } from '$lib/speciesLibrary';
import { backgroundDisplayName, type BackgroundInfo } from '$lib/backgroundsLibrary';
import { displayName, type ItemIndex } from '$lib/itemLibrary';
import type { SpellIndex } from '$lib/spellLibrary';
import { parseClassLevelText, cleanClassName } from '$lib/schemas/classLevelText';
import { type Character, type CharacterClass, type CharacterSpecies, type CharacterBackground, type ProficiencyFlags, type SpellRef } from '$lib/schemas/characterSchema';

type InventoryLine = Character['inventory'][number];
/** Zaubertricks tragen kein `prepared` — für die Verlinkung zählt nur name/sourceKey. */
type SpellRefLike = SpellRef;

export type LegacyFixKind = 'classes' | 'species' | 'background' | 'inventory' | 'spells' | 'weapons';

export interface LegacyFix {
  kind: LegacyFixKind;
  label: string;
  /** Idempotent — ein zweiter Aufruf findet nichts mehr. */
  apply: () => void;
}

export interface LegacyLinkTarget {
  classes: CharacterClass[];
  /** Ursprünglicher Freitext („Kämpfer 5 / Schurke 2"), falls `classes` leer geblieben ist. */
  legacyClassLevel: string;
  species: CharacterSpecies;
  backgroundRef: CharacterBackground;
  inventory: InventoryLine[];
  cantrips: SpellRefLike[];
  spellsByLevel: Record<string, SpellRefLike[]>;
  proficiencies: ProficiencyFlags;
}

/** Was noch lädt, wird schlicht nicht angeboten. */
export interface LegacyLinkLibraries {
  classes: ClassInfo[];
  species: SpeciesInfo[];
  backgrounds: BackgroundInfo[];
  items: ItemIndex;
  spells: SpellIndex;
}

/** Exakt, deutsch oder englisch, nie Substring — ein falscher Link wäre schlimmer als keiner. */
function exactMatch<T extends { key?: string; name: string; nameDe?: string }>(
  index: T[],
  rawName: string,
): T | undefined {
  const q = rawName.trim().toLowerCase();
  if (!q) return undefined;
  return index.find((e) => !!e.key && ((e.nameDe ?? e.name).toLowerCase() === q || e.name.toLowerCase() === q));
}

/** Nur GRUNDklassen sind verlinkbar; Subklassen hängen am Dropdown der Zeile. */
const baseClasses = (index: ClassInfo[]): ClassInfo[] => index.filter((c) => !c.subclassOf);

/** Wie `exactMatch`, aber räumt vorher Stufen-Rauschen weg („Schurke Level" → „Schurke"). */
function matchBaseClass(index: ClassInfo[], rawName: string): ClassInfo | undefined {
  return exactMatch(baseClasses(index), cleanClassName(rawName));
}

export function speciesFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const { species } = target;
  if (species.sourceKey || !species.name.trim()) return undefined;
  const hit = exactMatch(libs.species, species.name);
  if (!hit) return undefined;
  return {
    kind: 'species',
    label: `Volk „${species.name}" mit der Bibliothek verknüpfen`,
    apply: () => {
      species.name = speciesDisplayName(hit);
      species.sourceKey = hit.key ?? '';
      species.subspeciesKey = undefined;
      species.subspeciesName = undefined;
    },
  };
}

export function backgroundFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const { backgroundRef } = target;
  if (backgroundRef.sourceKey || !backgroundRef.name.trim()) return undefined;
  const hit = exactMatch(libs.backgrounds, backgroundRef.name);
  if (!hit) return undefined;
  return {
    kind: 'background',
    label: `Hintergrund „${backgroundRef.name}" mit der Bibliothek verknüpfen`,
    apply: () => {
      backgroundRef.name = backgroundDisplayName(hit);
      backgroundRef.sourceKey = hit.key ?? '';
    },
  };
}

/** Zerlegen und Verlinken in EINEM Angebot — Freitext ist ohne Zerlegung nicht verlinkbar. */
export function classesFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const needsStructuring = target.classes.length === 0 && target.legacyClassLevel.trim().length > 0;
  const base = target.classes.length > 0 ? target.classes : parseClassLevelText(target.legacyClassLevel);
  if (base.length === 0) return undefined;
  const linkable = base.filter((c) => !c.sourceKey && c.name.trim() && matchBaseClass(libs.classes, c.name)).length;
  if (!needsStructuring && linkable === 0) return undefined;
  return {
    kind: 'classes',
    label: needsStructuring
      ? 'Freitext-Klasse in strukturierte Klassen übernehmen'
      : `${linkable} ${linkable === 1 ? 'Klasse' : 'Klassen'} mit der Bibliothek verknüpfen`,
    apply: () => {
      if (needsStructuring) target.classes.splice(0, target.classes.length, ...parseClassLevelText(target.legacyClassLevel));
      for (const cls of target.classes) {
        if (cls.sourceKey || !cls.name.trim()) continue;
        const hit = matchBaseClass(libs.classes, cls.name);
        if (hit?.key) {
          cls.sourceKey = hit.key;
          cls.name = classDisplayName(hit);
        } else {
          cls.name = cleanClassName(cls.name); // Homebrew: wenigstens „Level"-Rauschen weg
        }
      }
    },
  };
}

export function inventoryFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const rows = target.inventory.filter((line) => {
    if (line.sourceKey?.trim()) return false;
    const nm = line.name.trim().toLowerCase();
    // Mehrdeutige liegen lassen: ein falscher Key wäre schlimmer als keiner.
    if (!nm || libs.items.ambiguous.has(nm)) return false;
    return !!libs.items.byName.get(nm)?.key;
  });
  if (!rows.length) return undefined;
  return {
    kind: 'inventory',
    label: `${rows.length} ${rows.length === 1 ? 'Gegenstand' : 'Gegenstände'} mit der Bibliothek verknüpfen`,
    apply: () => {
      for (const line of rows) {
        const hit = libs.items.byName.get(line.name.trim().toLowerCase());
        if (!hit?.key) continue;
        line.sourceKey = hit.key;
        // Den Namen mitziehen, damit Anzeige, Datei und PDF dasselbe sagen.
        line.name = displayName(hit);
        line.weight = hit.weight != null ? String(hit.weight) : '';
      }
    },
  };
}

function allSpellRefs(target: LegacyLinkTarget): SpellRefLike[] {
  return [...target.cantrips, ...Object.values(target.spellsByLevel).flat()];
}

export function spellsFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const refs = allSpellRefs(target).filter((ref) => {
    if (ref.sourceKey?.trim()) return false;
    const nm = ref.name.trim().toLowerCase();
    if (!nm || libs.spells.ambiguous.has(nm)) return false;
    return !!libs.spells.byName.get(nm)?.key;
  });
  if (!refs.length) return undefined;
  return {
    kind: 'spells',
    label: `${refs.length} Zauber mit der Bibliothek verknüpfen`,
    apply: () => {
      for (const ref of refs) {
        const hit = libs.spells.byName.get(ref.name.trim().toLowerCase());
        if (!hit?.key) continue;
        ref.sourceKey = hit.key;
        ref.name = hit.name; // deutschen Bibliotheksnamen mitziehen (wie beim Inventar)
      }
    },
  };
}

/**
 * Namen im Waffen-Freitext, die die Bibliothek als Waffe kennt: die wirken als
 * `individualWeapons` (Waffenbeherrschung, Übungsbonus), als Prosa wirken sie nicht.
 * Prosa wie „Kriegswaffen mit Finesse" trifft nichts und BLEIBT deshalb stehen.
 */
function splitWeaponText(text: string, libs: LegacyLinkLibraries): { movable: string[]; rest: string[] } {
  const movable: string[] = [];
  const rest: string[] = [];
  for (const part of text.split(/[,;]/).map((s) => s.trim())) {
    if (!part) continue;
    const nm = part.toLowerCase();
    const hit = libs.items.ambiguous.has(nm) ? undefined : libs.items.byName.get(nm);
    if (hit?.key && hit.category === 'weapon') movable.push(displayName(hit));
    else rest.push(part);
  }
  return { movable, rest };
}

/** Waffennamen aus dem Freitext in die strukturierte Liste heben. */
export function weaponsFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const { movable } = splitWeaponText(target.proficiencies.otherWeapons, libs);
  if (!movable.length) return undefined;
  return {
    kind: 'weapons',
    label: `${movable.length} ${movable.length === 1 ? 'Waffe' : 'Waffen'} aus dem Freitext als Einzelübung übernehmen`,
    apply: () => {
      const prof = target.proficiencies;
      const { movable: hits, rest } = splitWeaponText(prof.otherWeapons, libs);
      for (const name of hits) {
        if (!prof.individualWeapons.some((x) => x.toLowerCase() === name.toLowerCase())) {
          prof.individualWeapons.push(name);
        }
      }
      prof.otherWeapons = rest.join(', ');
    },
  };
}

/** Leer heißt: vollständig verknüpft — oder die Bibliotheken sind noch nicht geladen. */
export function collectLegacyFixes(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix[] {
  return [
    classesFix(target, libs),
    speciesFix(target, libs),
    backgroundFix(target, libs),
    inventoryFix(target, libs),
    spellsFix(target, libs),
    weaponsFix(target, libs),
  ].filter((f): f is LegacyFix => !!f);
}

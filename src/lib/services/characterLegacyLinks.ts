/**
 * Die EINE Stelle, die sagt, was an einem Charakter noch mit der Bibliothek verknüpfbar
 * ist — kein `CHARACTER_UPGRADES`-Schritt, dessen `apply` ist synchron und käme an die
 * Bibliothek nicht heran. `apply` mutiert die Formular-Objekte in place; den UI-Nachlauf
 * (Anzeige-Spiegel, offene Picker) macht der Aufrufer.
 */
import { classDisplayName, type ClassInfo } from '$lib/classLibrary';
import { speciesDisplayName, type SpeciesInfo } from '$lib/speciesLibrary';
import { backgroundDisplayName, type BackgroundInfo } from '$lib/backgroundsLibrary';
import { displayName, matchWeaponName, type ItemIndex } from '$lib/itemLibrary';
import { parseClassLevelText, cleanClassName } from '$lib/schemas/classLevelText';
import { normName } from '$lib/utils/text';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import { addIndividualWeapon } from './weaponProficiency';
import { poolPicks, type OptionPoolOffer } from './declaration/optionPool';
import { buildAttackFromWeapon, type WeaponAttackContext } from './attackCalc';
import type { LoadedSpellcasting } from './spellcasting/project';
import {
  applyFlatSpellPlan,
  hasFlatSpellContent,
  planFlatSpellMigration,
  planIsEmpty,
  reduceFlatSpells,
} from './spellcasting/migrate';
import { type Attack, type Character, type CharacterClass, type CharacterFeatureEntry, type CharacterSpecies, type CharacterBackground, type CharacterSpells, type OptionPick, type ProficiencyFlags } from '$lib/schemas/characterSchema';

type InventoryLine = Character['inventory'][number];

export type LegacyFixKind = 'classes' | 'species' | 'background' | 'inventory' | 'spells' | 'weapons' | 'attacks' | 'optionPicks';

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
  /** Das Merkmals-Ledger der Seitenleiste — `optionPicksFix` räumt daraus ab, sonst unberührt. */
  features: CharacterFeatureEntry[];
  optionPicks: OptionPick[];
  /** Die Altform am Draft; `dropSpells` löscht sie, sobald der Umzug sie leer zurücklässt. */
  spells: CharacterSpells | undefined;
  dropSpells: () => void;
  spellcasting: CharacterSpellcasting;
  proficiencies: ProficiencyFlags;
  attacks: Attack[];
  /** Zum Nachrechnen von Bonus/Schaden, wenn `attacksFix` einen Alt-Angriff auf `auto` umstellt. */
  weaponCtx: WeaponAttackContext;
}

/** Was noch lädt, wird schlicht nicht angeboten. */
export interface LegacyLinkLibraries {
  classes: ClassInfo[];
  species: SpeciesInfo[];
  backgrounds: BackgroundInfo[];
  items: ItemIndex;
  /** Die aufgelösten Zauberquellen zum aktuellen Formularstand. */
  casting: LoadedSpellcasting | null;
  /** Die Options-Pools zum aktuellen Formularstand, wie sie der Picker anbietet. */
  pools: OptionPoolOffer[];
}

/** Exakt, deutsch oder englisch, nie Substring — ein falscher Link wäre schlimmer als keiner. */
function exactMatch<T extends { key?: string; name: string; nameDe?: string }>(
  index: T[],
  rawName: string,
): T | undefined {
  const q = normName(rawName);
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
    const nm = normName(line.name);
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
        const hit = libs.items.byName.get(normName(line.name));
        if (!hit?.key) continue;
        line.sourceKey = hit.key;
        // Den Namen mitziehen, damit Anzeige, Datei und PDF dasselbe sagen.
        line.name = displayName(hit);
        line.weight = hit.weight != null ? String(hit.weight) : '';
      }
    },
  };
}

/** Angriffe aus der Zeit vor dem `sourceKey`-Feld: Freitext, der eine Waffe der Bibliothek nennt. */
export function attacksFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const rows = target.attacks.filter((a) => {
    if (a.sourceKey?.trim()) return false;
    const nm = normName(a.name);
    if (!nm || libs.items.ambiguous.has(nm)) return false;
    const hit = libs.items.byName.get(nm);
    return !!hit?.key && hit.category === 'weapon';
  });
  if (!rows.length) return undefined;
  return {
    kind: 'attacks',
    label: `${rows.length} ${rows.length === 1 ? 'Angriff' : 'Angriffe'} mit der Waffen-Bibliothek verknüpfen`,
    apply: () => {
      for (const a of rows) {
        const hit = libs.items.byName.get(normName(a.name));
        if (!hit?.key || hit.category !== 'weapon') continue;
        const modifiers = a.modifiers;
        Object.assign(a, buildAttackFromWeapon(hit, target.weaponCtx));
        if (modifiers?.length) a.modifiers = modifiers;
      }
    },
  };
}

/**
 * Der Umzug der Altform in `spellcasting`. Ohne aufgelöste Quellen wird nichts angeboten:
 * welches Kontingent einen Zauber trägt, weiß erst die Bibliothek.
 */
export function spellsFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const spells = target.spells;
  if (!spells || !libs.casting || !hasFlatSpellContent(spells)) return undefined;
  const { state, lookup, legacy } = libs.casting;
  const plan = planFlatSpellMigration(target.spellcasting, state, lookup, legacy.spells);
  if (planIsEmpty(plan)) return undefined;

  const moved = [plan.moved && `${plan.moved} Zauber`, plan.slotTotals.some((n) => n > 0) && 'Zauberplätze']
    .filter(Boolean)
    .join(' und ');
  const rest = plan.unresolved.length ? ` (${plan.unresolved.length} ohne Bibliothekstreffer bleiben stehen)` : '';
  return {
    kind: 'spells',
    label: `${moved || 'Zauberblock'} ins neue Format übernehmen${rest}`,
    apply: () => {
      applyFlatSpellPlan(target.spellcasting, plan);
      reduceFlatSpells(spells, plan);
      if (!hasFlatSpellContent(spells)) target.dropSpells();
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
    const weapon = matchWeaponName(libs.items, part);
    if (weapon) movable.push(weapon);
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
      for (const name of hits) addIndividualWeapon(prof.individualWeapons, name);
      prof.otherWeapons = rest.join(', ');
    },
  };
}

interface PooledLedgerChoice {
  entry: CharacterFeatureEntry;
  pick: OptionPick;
}

/**
 * Ledger-Antworten auf Merkmale, die inzwischen einen Options-Pool stellen (Beute des Jägers).
 * Der Altbestand trägt sein Label auch DEUTSCH (`choice` vor Upgrade-Schritt 6), deshalb
 * trifft die Option über beide Sprachen — was die Bibliothek nicht bestätigt, bleibt liegen.
 */
function pooledLedgerChoices(target: LegacyLinkTarget, libs: LegacyLinkLibraries): PooledLedgerChoice[] {
  const out: PooledLedgerChoice[] = [];
  for (const offer of libs.pools)
    for (const entry of target.features) {
      if (entry.sourceKey !== offer.featureKey) continue;
      const answers = [entry.choice, entry.choiceDe].map(normName).filter(Boolean);
      if (!answers.length) continue;
      const option = offer.options.find(
        (o) => answers.includes(normName(o.value)) || answers.includes(normName(o.labelDe)),
      );
      if (!option) continue;
      out.push({
        entry,
        pick: { sourceKey: offer.featureKey, value: option.value, valueDe: option.labelDe || option.value },
      });
    }
  return out;
}

/**
 * Der Ledger-Eintrag ANNOTIERT ein Merkmal, das seine Frage nicht mehr stellt — er geht auch
 * dann, wenn seine Option längst im Pool steht: dann ist er die Dublette.
 */
export function optionPicksFix(target: LegacyLinkTarget, libs: LegacyLinkLibraries): LegacyFix | undefined {
  const moves = pooledLedgerChoices(target, libs);
  if (!moves.length) return undefined;
  return {
    kind: 'optionPicks',
    label: `${moves.length} Merkmals-Wahl${moves.length === 1 ? '' : 'en'} in den Options-Pool übernehmen`,
    apply: () => {
      for (const { entry, pick } of pooledLedgerChoices(target, libs)) {
        const mine = poolPicks(target.optionPicks, pick.sourceKey);
        if (!mine.some((p) => p.value === pick.value)) target.optionPicks.push(pick);
        const at = target.features.indexOf(entry);
        if (at >= 0) target.features.splice(at, 1);
      }
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
    attacksFix(target, libs),
    optionPicksFix(target, libs),
  ].filter((f): f is LegacyFix => !!f);
}

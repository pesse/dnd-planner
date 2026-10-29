/**
 * Das eine Bündel, aus dem der Bogen gebaut wird. Nur hier wird geladen — jeder Renderer
 * darunter ist synchron, damit ein Häkchen im Vorschau-Dialog kein Nachladen auslöst. Einzige
 * Ausnahme sind die Volltext-Karten: die messen im DOM und kommen erst beim Anhaken dazu.
 */
import type { Character } from '$lib/schemas/characterSchema';
import { resolveCharacterFeatures, type ResolvedCharacterFeatures } from '$lib/services/characterFeatures';
import { loadSpellcasting, type LoadedSpellcasting } from '$lib/services/spellcasting/project';
import { groupedSpellcasting, type GroupedSpellcasting } from '$lib/services/spellcasting/grouped';
import { masteryOffer, type MasteryOffer } from '$lib/services/weaponMastery';
import { optionPoolOffers, type OptionPoolOffer } from '$lib/services/declaration/optionPool';
import { effectiveProficiencyBonus, getProgressionByKey, levelColumns, levelTables } from '$lib/services/classProgression';
import { valueTracks, type ValueTrack } from '$lib/domain/classResources';
import { resolveResources, type ResolvedResource } from '$lib/services/resources/resolve';
import { computeAttackBonus, computeAttackDamage } from '$lib/services/attackCalc';
import { loadDeclaredAttackEffects, type DeclaredAttackEffects } from '$lib/services/attackEffects';
import type { ItemInfo } from '$lib/itemLibrary';
import { abilityRecordOf, type AbilityKey, type AbilityScores } from '$lib/schemas/abilities';
import { mod } from '$lib/domain/skills';
import { characterAuras, type CharacterAura } from '$lib/services/auras';
import {
  loadSavingThrowInputs, savingThrowDerivations, savingThrowSources, type SavingThrowDerivation,
} from '$lib/services/savingThrows';
import { effectiveScores, loadWornAbilityEffects, type WornAbilityEffect } from '$lib/services/effectiveAbilities';
import { combatFallbacksFrom, withCombatFallbacks } from '$lib/services/combatFallbacks';
import { loadHpLibraryParts } from '$lib/services/hitPoints';
import { cardItemInfos } from './itemCards';
import { loadPrintFigure, type PrintFigure } from './pages/figure';
import type { PrintImage } from './imageCards';
import { formatDamageDice } from '$lib/itemFormat';

export interface PrintAttack {
  name: string;
  bonus: string;
  damage: string;
  type: string;
  range: string;
  note: string;
}

/** Ein Werte-Block trägt seine Klasse, weil zwei Klassen gleichnamige Spalten führen. */
export interface ClassValues {
  className: string;
  tracks: ValueTrack[];
}

export interface CharacterPrintData {
  character: Character;
  /** Wirksame Attributswerte, samt Gegenständen; `character.abilities` ist der Grundwert. */
  scores: AbilityScores;
  /** Bereits `data:`-URL; leer = kein Portrait. */
  portraitUrl: string;
  /** Dasselbe für das Bild des Gefährten. */
  companionImageUrl: string;
  /** Freitext des Details-Tabs, als Markdown. */
  freetext: string;
  attacks: PrintAttack[];
  saves: Record<AbilityKey, SavingThrowDerivation>;
  auras: CharacterAura[];
  features: ResolvedCharacterFeatures;
  grouped: GroupedSpellcasting;
  mastery: MasteryOffer;
  pools: OptionPoolOffer[];
  /** Vorräte mit Maximum — Einsätze, Punkte, Zauberplätze. */
  resources: ResolvedResource[];
  /** Die skalierenden Spalten daneben: Rauschschaden, Hinterhältiger Angriff, Kampfkunst. */
  values: ClassValues[];
  /** Die im Inventar für eine Karte angehakten Gegenstände. */
  cardItems: ItemInfo[];
  /** null = nichts angelegt. */
  figure: PrintFigure | null;
  /** Die im Bilder-Reiter zum Druck markierten Bilder. */
  images: PrintImage[];
  /**
   * Fertige Kartenseiten. Leer, bis der Dialog sie anfordert: die Karten messen ihren Text im
   * DOM aus (`spellCards.ts`, `itemCards.ts`), und das darf nicht bei jedem Öffnen der
   * Vorschau laufen.
   */
  spellCards: string;
  itemCards: string;
}

export interface PrintDataInput {
  character: Character;
  portraitUrl?: string;
  companionImageUrl?: string;
  figureUrl?: string;
  freetext?: string;
  images?: PrintImage[];
  /** Derselbe Resolver, der die Meisterschaft auf dem Bildschirm-Bogen zeichnet. */
  masteryOf?: (attackName: string) => string | undefined;
  /** Schon geladen (CharacterSheet hält es); sonst wird nachgeladen. */
  loaded?: LoadedSpellcasting | null;
}

const EMPTY_FEATURES: ResolvedCharacterFeatures = {
  speciesGroups: [], classGroups: [], backgroundGroups: [], featEntries: [], orphanChoices: [],
};

/** Ein Fehlschlag darf den Bogen nicht verhindern — er druckt dann weniger. */
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

function printAttacks(
  c: Character,
  declared: DeclaredAttackEffects | undefined,
  masteryOf?: (name: string) => string | undefined,
): PrintAttack[] {
  const ctx = { strMod: c.mods.str, dexMod: c.mods.dex, proficiencyBonus: effectiveProficiencyBonus(c), declared };
  return (c.attacks ?? []).map((a) => {
    const mastery = masteryOf?.(a.name);
    return {
      name: mastery ? `${a.name} (${mastery})` : a.name,
      bonus: a.auto ? computeAttackBonus(a, ctx) : a.bonus,
      // Handeingetragener Schaden steht oft als „1d8+2" in der Datei — der Bogen schreibt W.
      damage: a.auto ? computeAttackDamage(a, ctx) : formatDamageDice(a.damage),
      type: a.type,
      range: a.range,
      note: (a.note ?? '').trim(),
    };
  });
}

async function classValues(c: Character): Promise<ClassValues[]> {
  const out: ClassValues[] = [];
  for (const cls of c.classes ?? []) {
    if (!cls.sourceKey) continue;
    const prog = await getProgressionByKey(cls.sourceKey).catch(() => null);
    if (!prog) continue;
    const sub = cls.subclassKey ? await getProgressionByKey(cls.subclassKey).catch(() => null) : null;
    // Späterer Eintrag gewinnt, die Kette steht spezifisch zuerst — deshalb rückwärts.
    const columns = Object.assign({}, ...levelTables(prog, sub).reverse().map((p) => levelColumns(p, cls.level)));
    const tracks = valueTracks(columns);
    if (tracks.length) out.push({ className: cls.name || prog.nameDe || prog.name, tracks });
  }
  return out;
}

export async function loadCharacterPrintData(input: PrintDataInput): Promise<CharacterPrintData> {
  const c = input.character;
  const [features, loaded, mastery, pools, values, cardItems, abilityEffects, declared, figure, saveInputs, hpParts] = await Promise.all([
    safe(resolveCharacterFeatures(c), EMPTY_FEATURES),
    input.loaded ? Promise.resolve(input.loaded) : safe(loadSpellcasting(c), null),
    safe(masteryOffer(c), { allowance: 0, className: '', meleeOnly: false, weapons: [] } as MasteryOffer),
    safe(optionPoolOffers(c), [] as OptionPoolOffer[]),
    safe(classValues(c), [] as ClassValues[]),
    safe(cardItemInfos(c), [] as ItemInfo[]),
    safe(loadWornAbilityEffects(c.inventory ?? []), [] as WornAbilityEffect[]),
    safe(loadDeclaredAttackEffects(c), undefined),
    safe(loadPrintFigure(c, input.figureUrl), null),
    safe(loadSavingThrowInputs(c), { worn: [], idle: [], features: [] }),
    safe(loadHpLibraryParts(c), null),
  ]);

  // Die Vorräte kommen aus demselben Lauf wie die Zauber: ein zweites `resolveResources` liefe
  // ein zweites Mal durch Klassen, Talente und Gegenstandsbibliothek.
  const grouped = loaded
    ? groupedSpellcasting(loaded.state, loaded.lookup)
    : { sources: [], resources: [], extra: [], issues: [] };

  const scores = effectiveScores(c.abilities, abilityEffects);
  const shown = withCombatFallbacks(c, combatFallbacksFrom(c, saveInputs, scores, hpParts));
  const mods = abilityRecordOf((k) => mod(scores[k]));
  const auras = characterAuras(saveInputs.features, { mods, profBonus: effectiveProficiencyBonus(c) });
  const saves = savingThrowDerivations({
    mods,
    profBonus: effectiveProficiencyBonus(c),
    saveProfs: c.saveProfs,
    sources: savingThrowSources(saveInputs.worn, saveInputs.features, auras),
  });

  return {
    character: shown,
    scores,
    portraitUrl: input.portraitUrl ?? '',
    companionImageUrl: input.companionImageUrl ?? '',
    freetext: input.freetext ?? '',
    attacks: printAttacks(shown, declared, input.masteryOf),
    saves,
    auras,
    features,
    grouped,
    mastery,
    pools: pools.filter((p) => p.allowance > 0),
    resources: grouped.resources,
    values,
    cardItems,
    figure,
    images: input.images ?? [],
    spellCards: '',
    itemCards: '',
  };
}

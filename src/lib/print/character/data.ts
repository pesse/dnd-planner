/**
 * Das eine Bündel, aus dem der Bogen gebaut wird. Nur hier wird geladen — jeder Renderer
 * darunter ist synchron, damit ein Häkchen im Vorschau-Dialog kein Nachladen auslöst. Einzige
 * Ausnahme sind die Zauberkarten: die messen im DOM und kommen erst beim Anhaken dazu.
 */
import type { Character } from '$lib/schemas/characterSchema';
import { resolveCharacterFeatures, type ResolvedCharacterFeatures } from '$lib/services/characterFeatures';
import { loadSpellcasting, type LoadedSpellcasting } from '$lib/services/spellcasting/project';
import { groupedSpellcasting, type GroupedSpellcasting } from '$lib/services/spellcasting/grouped';
import { masteryOffer, type MasteryOffer } from '$lib/services/weaponMastery';
import { optionPoolOffers, type OptionPoolOffer } from '$lib/services/declaration/optionPool';
import { getProgressionByKey, levelColumns } from '$lib/services/classProgression';
import { resourceTracks, type ResourceTrack } from '$lib/domain/classResources';
import { computeAttackBonus, computeAttackDamage } from '$lib/services/attackCalc';
import { formatDamageDice } from '$lib/itemFormat';

export interface PrintAttack {
  name: string;
  bonus: string;
  damage: string;
  type: string;
  range: string;
}

/** Ein Ressourcen-Block trägt seine Klasse, weil zwei Klassen gleichnamige Spalten führen. */
export interface ClassResources {
  className: string;
  tracks: ResourceTrack[];
}

export interface CharacterPrintData {
  character: Character;
  /** Bereits `data:`-URL; leer = kein Portrait. */
  portraitUrl: string;
  /** Freitext des Details-Tabs, als Markdown. */
  freetext: string;
  attacks: PrintAttack[];
  features: ResolvedCharacterFeatures;
  grouped: GroupedSpellcasting;
  mastery: MasteryOffer;
  pools: OptionPoolOffer[];
  resources: ClassResources[];
  /**
   * Fertige Kartenseiten. Leer, bis der Dialog sie anfordert: die Karten messen ihren Text im
   * DOM aus (`spellCards.ts`), und das darf nicht bei jedem Öffnen der Vorschau laufen.
   */
  spellCards: string;
}

export interface PrintDataInput {
  character: Character;
  portraitUrl?: string;
  freetext?: string;
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

function printAttacks(c: Character, masteryOf?: (name: string) => string | undefined): PrintAttack[] {
  const ctx = { strMod: c.mods.str, dexMod: c.mods.dex, proficiencyBonus: c.proficiencyBonus };
  return (c.attacks ?? []).map((a) => {
    const mastery = masteryOf?.(a.name);
    return {
      name: mastery ? `${a.name} (${mastery})` : a.name,
      bonus: a.auto ? computeAttackBonus(a, ctx) : a.bonus,
      // Handeingetragener Schaden steht oft als „1d8+2" in der Datei — der Bogen schreibt W.
      damage: a.auto ? computeAttackDamage(a, ctx) : formatDamageDice(a.damage),
      type: a.type,
      range: a.range,
    };
  });
}

async function classResources(c: Character): Promise<ClassResources[]> {
  const out: ClassResources[] = [];
  for (const cls of c.classes ?? []) {
    if (!cls.sourceKey) continue;
    const prog = await getProgressionByKey(cls.sourceKey).catch(() => null);
    if (!prog) continue;
    const tracks = resourceTracks(levelColumns(prog, cls.level));
    if (tracks.length) out.push({ className: cls.name || prog.nameDe || prog.name, tracks });
  }
  return out;
}

export async function loadCharacterPrintData(input: PrintDataInput): Promise<CharacterPrintData> {
  const c = input.character;
  const [features, loaded, mastery, pools, resources] = await Promise.all([
    safe(resolveCharacterFeatures(c), EMPTY_FEATURES),
    input.loaded ? Promise.resolve(input.loaded) : safe(loadSpellcasting(c), null),
    safe(masteryOffer(c), { allowance: 0, className: '', meleeOnly: false, weapons: [] } as MasteryOffer),
    safe(optionPoolOffers(c), [] as OptionPoolOffer[]),
    safe(classResources(c), [] as ClassResources[]),
  ]);

  const grouped = loaded
    ? groupedSpellcasting(loaded.state, loaded.lookup)
    : { sources: [], slots: [], pact: null, manualSlots: false, extra: [], issues: [] };

  return {
    character: c,
    portraitUrl: input.portraitUrl ?? '',
    freetext: input.freetext ?? '',
    attacks: printAttacks(c, input.masteryOf),
    features,
    grouped,
    mastery,
    pools: pools.filter((p) => p.allowance > 0),
    resources,
    spellCards: '',
  };
}

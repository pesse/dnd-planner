/**
 * Der Schema-Spiegel des Charakter-Formulars: Datei → Formularfelder → Datei.
 * Rein und total — `CharacterFormPatch` deckt jedes Feld ab, das das Formular besitzt,
 * ein neues Schema-Feld ist damit ein Compile-Fehler statt einer stillen Lücke.
 */
import { SKILL_DEFS } from '../domain/skills';
import { ABILITY_KEYS, type AbilityFlags, type AbilityScores } from '../schemas/abilities';
import { formatClassLevel } from '../schemas/classLevelText';
import { attackForSave, type AttackCalcContext } from './attackCalc';
import {
  emptyPersonal, emptyProficiencies,
  type Attack, type Character, type CharacterBackground, type CharacterClass,
  type CharacterSpecies, type OptionPick, type PersonalData, type ProficiencyFlags,
} from '../schemas/characterSchema';
import type { CharacterSpellcasting } from '../schemas/spellcasting';
import { cloneSpellcasting, emptySpellcasting, pruneSpellcasting } from './spellcasting/write';

type InventoryLine = Character['inventory'][number];
type Currency = Character['currency'];
type SkillFlags = { prof: boolean; exp: boolean };

export interface CharacterFormFields {
  name: string;
  classes: CharacterClass[];
  playerName: string;
  backgroundRef: CharacterBackground;
  background: string;
  species: CharacterSpecies;
  race: string;
  xp: string;
  abilities: AbilityScores;
  ac: string;
  initiative: string;
  speed: string;
  hpMax: string;
  hpCurrent: string;
  hpTemp: string;
  proficiencyBonus: number;
  hitDice: string;
  saveProfs: AbilityFlags;
  skillFlags: Record<string, SkillFlags>;
  attacks: Attack[];
  classFeatures: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  languages: string[];
  tools: string[];
  alleskoenner: boolean;
  currency: Currency;
  inventory: InventoryLine[];
  inventoryNotes: string;
  spellcasting: CharacterSpellcasting;
  personal: PersonalData;
  proficiencies: ProficiencyFlags;
  masteries: string[];
  optionPicks: OptionPick[];
  portraitFile: string;
}

/** Einmalig beim Anlegen erfasst, damit der Rückschreib-Effekt sie NICHT reaktiv liest. */
export interface CharacterFormCarry {
  passivePerception: string;
  totalWeight: string;
  /** VOR der Ableitung aus `classes` — Grundlage der Altformat-Umstellung. */
  legacyClassLevel: string;
}

// `uid` ist Identität, kein Formularfeld — stünde es hier, schriebe jeder Tastendruck
// die Identität des Charakters mit dem Formularzustand über.
export type CharacterFormPatch =
  Omit<Character, 'uid' | 'features' | '_version' | '_importedFrom' | '_importedAt'>
  & { portraitFile: string | undefined };

export const mod = (score: number) => Math.floor((score - 10) / 2);

export function abilityMods(f: CharacterFormFields): AbilityScores {
  return Object.fromEntries(ABILITY_KEYS.map((k) => [k, mod(f.abilities[k])])) as AbilityScores;
}

export function attackContext(f: CharacterFormFields): AttackCalcContext {
  const m = abilityMods(f);
  return { strMod: m.str, dexMod: m.dex, proficiencyBonus: f.proficiencyBonus };
}

export function computeSkills(f: CharacterFormFields): Character['skills'] {
  const mods = abilityMods(f);
  const result: Character['skills'] = {};
  for (const def of SKILL_DEFS) {
    const flags = f.skillFlags[def.key];
    const base = mods[def.attr] ?? 0;
    const pb = f.proficiencyBonus;
    let value = base;
    if (flags.exp) value = base + pb * 2;
    else if (flags.prof) value = base + pb;
    else if (f.alleskoenner) value = base + Math.floor(pb / 2);
    result[def.key] = { value, prof: flags.prof, exp: flags.exp };
  }
  return result;
}

/**
 * Ein Altdaten-Wert steht nicht zwingend in der Liste und kommt deshalb vorne dazu — sonst
 * zeigt das Select ihn nicht und die erste Auswahl verwürfe ihn stillschweigend.
 */
export const withCurrent = (options: readonly string[], current: string): readonly string[] =>
  current.trim() && !options.includes(current) ? [current, ...options] : options;

/** Alphabetisch für Listen ohne fachliche Ordnung; der Altdaten-Wert bleibt trotzdem vorne. */
export const withCurrentSorted = (options: readonly string[], current: string): readonly string[] =>
  withCurrent([...options].sort((a, b) => a.localeCompare(b, 'de')), current);

/** Vorgabewerte als Reihenfolge- UND Typquelle; Lücken im Bestand fallen darauf zurück. */
function withDefaults<T extends object>(base: T, given: Partial<T> | undefined): T {
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const value = given?.[key];
    if (value !== undefined && value !== null) out[key] = value as T[keyof T];
  }
  return out;
}

/** `individualWeapons` ist die eine Liste darin — ein Spread allein teilte sie mit dem Draft. */
const copyProficiencies = (p: ProficiencyFlags): ProficiencyFlags =>
  ({ ...p, individualWeapons: [...p.individualWeapons] });

export function initialFormFields(character: Character): CharacterFormFields {
  return {
    name: character.name ?? '',
    // Tief kopieren: sonst teilt das Formular die Instanz mit dem Draft und schreibt am
    // Rückschreib-Effekt vorbei.
    classes: (character.classes ?? []).map((c) => ({ ...c })),
    playerName: character.playerName ?? '',
    backgroundRef: { ...(character.backgroundRef ?? { sourceKey: '', name: '' }) },
    background: character.background ?? '',
    species: { ...(character.species ?? { sourceKey: '', name: '' }) },
    race: character.race ?? '',
    xp: character.xp ?? '',
    abilities: { ...character.abilities },
    ac: character.ac ?? '',
    initiative: character.initiative ?? '',
    speed: character.speed ?? '',
    hpMax: character.hpMax ?? '',
    hpCurrent: character.hpCurrent ?? '',
    hpTemp: character.hpTemp ?? '',
    proficiencyBonus: character.proficiencyBonus ?? 2,
    hitDice: character.hitDice ?? '',
    saveProfs: { ...character.saveProfs },
    skillFlags: Object.fromEntries(SKILL_DEFS.map((s) => [s.key, {
      prof: character.skills[s.key]?.prof ?? false,
      exp: character.skills[s.key]?.exp ?? false,
    }])),
    attacks: character.attacks.map((a) => ({
      ...a,
      ...(a.modifiers ? { modifiers: a.modifiers.map((m) => ({ ...m })) } : {}),
    })),
    classFeatures: character.classFeatures ?? '',
    traits: character.traits ?? '',
    ideals: character.ideals ?? '',
    bonds: character.bonds ?? '',
    flaws: character.flaws ?? '',
    languages: [...character.languages],
    tools: [...character.tools],
    alleskoenner: character.alleskoenner ?? false,
    currency: { ...character.currency },
    inventory: character.inventory.map((i) => ({ ...i })),
    inventoryNotes: character.inventoryNotes ?? '',
    spellcasting: character.spellcasting ? cloneSpellcasting(character.spellcasting) : emptySpellcasting(),
    personal: withDefaults(emptyPersonal(), character.personal),
    proficiencies: copyProficiencies(withDefaults(emptyProficiencies(), character.proficiencies)),
    masteries: [...(character.masteries ?? [])],
    optionPicks: (character.optionPicks ?? []).map((p) => ({ ...p })),
    portraitFile: character.portraitFile ?? '',
  };
}

export function initialFormCarry(character: Character): CharacterFormCarry {
  return {
    passivePerception: character.passivePerception,
    totalWeight: character.totalWeight,
    legacyClassLevel: character.classLevel ?? '',
  };
}

/**
 * Schlüssel-Reihenfolge wie im Zod-Schema, sonst wirkt ein frisch geladener Charakter dirty.
 * `features` fehlt bewusst: stünde das Ledger hier, überschriebe der nächste Tastendruck
 * jede in der Merkmals-Seitenleiste getroffene Wahl.
 */
export function formDraftPatch(f: CharacterFormFields, carry: CharacterFormCarry): CharacterFormPatch {
  const mods = abilityMods(f);
  const ctx = attackContext(f);
  // `classes` ist Source-of-Truth, `classLevel` nur der abgeleitete Anzeige-String.
  const cleanedClasses = f.classes.filter((c) => c.name.trim() !== '').map((c) => ({ ...c }));
  return {
    name: f.name,
    classes: cleanedClasses,
    classLevel: formatClassLevel(cleanedClasses),
    playerName: f.playerName,
    backgroundRef: { ...f.backgroundRef },
    background: f.background,
    species: { ...f.species },
    race: f.race,
    xp: f.xp,
    abilities: { ...f.abilities },
    mods,
    ac: f.ac,
    initiative: f.initiative,
    speed: f.speed,
    hpMax: f.hpMax,
    hpCurrent: f.hpCurrent,
    hpTemp: f.hpTemp,
    proficiencyBonus: f.proficiencyBonus,
    passivePerception: carry.passivePerception,
    hitDice: f.hitDice,
    saveProfs: { ...f.saveProfs },
    skills: computeSkills(f),
    attacks: f.attacks.filter((a) => a.name.trim() !== '').map((a) => attackForSave(a, ctx)),
    classFeatures: f.classFeatures,
    traits: f.traits,
    ideals: f.ideals,
    bonds: f.bonds,
    flaws: f.flaws,
    languages: [...f.languages],
    tools: [...f.tools],
    alleskoenner: f.alleskoenner,
    currency: { ...f.currency },
    inventory: f.inventory
      .filter((i) => i.name.trim() !== '')
      .map((i) => {
        const key = i.sourceKey?.trim();
        return { name: i.name, ...(key ? { sourceKey: key } : {}), count: i.count, weight: i.weight };
      }),
    inventoryNotes: f.inventoryNotes,
    // Die Gesamtlast rechnet `inventoryWeight` live; das gespeicherte Feld ist Alt-Ballast.
    totalWeight: carry.totalWeight,
    spellcasting: pruneSpellcasting(f.spellcasting),
    // `spells` steht bewusst nicht hier: die Altform gehört dem Draft, bis der Umzug
    // (`spellsFix`) sie übernommen hat — ein Speichern davor verlöre ihre Zauber.
    personal: { ...f.personal },
    proficiencies: copyProficiencies(f.proficiencies),
    masteries: [...f.masteries],
    optionPicks: f.optionPicks.map((p) => ({ ...p })),
    portraitFile: f.portraitFile || undefined,
  };
}

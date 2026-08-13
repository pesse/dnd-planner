/**
 * Die geschlossenen Regel-Vokabulare (englisch, SRD-Schreibweise) und die Leser, die
 * Regel-Prosa darauf abbilden. Zum deutschen Charakterbogen hin gibt es GENAU EINE
 * Übersetzungstabelle: `SKILL_DEFS.en` (domain/skills.ts) und `ABILITY_*` (abilities.ts).
 */
import { ABILITY_NAMES, type AbilityName } from './abilities';

export const SKILL_NAMES = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export const WEAPON_CATEGORIES = ['Simple', 'Martial'] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const ARMOR_TRAININGS = ['Light', 'Medium', 'Heavy', 'Shields'] as const;
export type ArmorTraining = (typeof ARMOR_TRAININGS)[number];

/**
 * Enum statt Freitext, damit ein LLM keinen erfundenen Wert liefern kann. Deutsche Namen
 * und Regeltexte stehen in `itemLibrary.ts` (`MASTERY_INFO`) — hier nur das Vokabular,
 * damit Zod es ohne Umweg über die Anzeige-Schicht nutzen kann.
 */
export const WEAPON_MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'] as const;
export type WeaponMastery = (typeof WEAPON_MASTERIES)[number];

/**
 * Entscheidet, WANN ein Talent genommen werden darf: Origin beim Hintergrund, General ab
 * Stufe 4, Fighting Style nur mit dem gleichnamigen Klassenmerkmal, Epic Boon ab 19.
 * Open5e nennt das Feld `type` — hier `category`, weil `type` schon die Artefaktart ist.
 */
export const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon'] as const;
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

/**
 * EIN Größen-Vokabular für Monster UND Charaktere; der Name ist historisch. Liegt hier
 * statt in `types.ts`, weil zwei Schemas darauf `z.enum` bauen und der Import ein Zyklus
 * wäre — `types.ts` liest von hier und re-exportiert.
 */
export const MONSTER_SIZES = {
  Tiny:        'Winzig',
  Small:       'Klein',
  Medium:      'Mittelgroß',
  Large:       'Groß',
  Huge:        'Riesig',
  Gargantuan:  'Gigantisch',
} as const;
export type MonsterSize = keyof typeof MONSTER_SIZES;
export const MONSTER_SIZE_KEYS = Object.keys(MONSTER_SIZES) as [MonsterSize, ...MonsterSize[]];

/** Schlüsselsatz zu `DAMAGE_TYPE_LABELS` (itemLabels.ts), das die deutschen Namen trägt. */
export const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Die Würfelgrößen, die Open5e an Kreaturen-Angriffen führt. */
export const DAMAGE_DICE = ['D4', 'D6', 'D8', 'D10', 'D12'] as const;
export type DamageDie = (typeof DAMAGE_DICE)[number];

export const CONDITIONS = {
  blinded:       'Geblendet',
  charmed:       'Bezaubert',
  deafened:      'Taub',
  exhaustion:    'Erschöpfung',
  frightened:    'Verängstigt',
  grappled:      'Gepackt',
  incapacitated: 'Handlungsunfähig',
  invisible:     'Unsichtbar',
  paralyzed:     'Gelähmt',
  petrified:     'Versteinert',
  poisoned:      'Vergiftet',
  prone:         'Liegend',
  restrained:    'Festgesetzt',
  stunned:       'Betäubt',
  unconscious:   'Bewusstlos',
} as const;
export type Condition = keyof typeof CONDITIONS;
export const CONDITION_KEYS = Object.keys(CONDITIONS) as [Condition, ...Condition[]];

/**
 * Ohne JEDES Leerzeichen, weil Open5es v2-Kerntabellen „Na ture" (Druide) und
 * „In sight" (Magier) enthalten — Leerzeichen mitten im Namen. Unterstrich und
 * Bindestrich fallen mit: Kreaturen liefern `animal_handling`, die Vokabular-Endpunkte
 * `animal-handling`.
 */
const foldRuleName = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, '');

function vocabularyLookup<T extends string>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((v) => [foldRuleName(v), v]));
}

const SKILL_LOOKUP = vocabularyLookup(SKILL_NAMES);
const ABILITY_LOOKUP = vocabularyLookup(ABILITY_NAMES);
const WEAPON_LOOKUP = vocabularyLookup(WEAPON_CATEGORIES);
const DAMAGE_TYPE_LOOKUP = vocabularyLookup(DAMAGE_TYPES);
const CONDITION_LOOKUP = vocabularyLookup(CONDITION_KEYS);
// „Shield" (Singular) kommt in der Prosa ebenso vor wie „Shields".
const ARMOR_LOOKUP = new Map([...vocabularyLookup(ARMOR_TRAININGS), ['shield', 'Shields' as ArmorTraining]]);

export const readSkillName = (raw: string): SkillName | null =>
  SKILL_LOOKUP.get(foldRuleName(raw.replace(/\bskills?\b/gi, ''))) ?? null;

export const readAbilityName = (raw: string): AbilityName | null => ABILITY_LOOKUP.get(foldRuleName(raw)) ?? null;

export const readWeaponCategory = (raw: string): WeaponCategory | null =>
  WEAPON_LOOKUP.get(foldRuleName(raw.replace(/\bweapons?\b/gi, ''))) ?? null;

export const readDamageType = (raw: string): DamageType | null =>
  DAMAGE_TYPE_LOOKUP.get(foldRuleName(raw)) ?? null;

export const readCondition = (raw: string): Condition | null =>
  CONDITION_LOOKUP.get(foldRuleName(raw)) ?? null;

export const readArmorTraining = (raw: string): ArmorTraining | null =>
  ARMOR_LOOKUP.get(foldRuleName(raw.replace(/\barmou?r\b/gi, '').replace(/\btraining\b/gi, ''))) ?? null;

/**
 * Zerlegt eine SRD-Aufzählung („Light, Medium, and Heavy armor and Shields",
 * „Animal Handling, Athletics, or Survival") in ihre Glieder.
 */
export function splitRuleList(raw: string): string[] {
  return raw
    .split(/,|\band\b|\bor\b/gi)
    .map((s) => s.trim().replace(/^(?:the|a|an)\s+/i, '').replace(/[.;]+$/, '').trim())
    .filter((s) => s && !/^none$/i.test(s));
}

/**
 * Wirft bei einem unbekannten Glied: Open5e v2 und der deutsche SRD-Auszug sind bekannt
 * deckungsgleich, eine Abweichung ist ein Parser-Fehler und soll sichtbar werden, statt
 * still eine Fertigkeit zu verschlucken.
 */
export function parseSkillNames(raw: string, context = 'Fertigkeitsliste'): SkillName[] {
  const out: SkillName[] = [];
  for (const part of splitRuleList(raw)) {
    const skill = readSkillName(part);
    if (!skill) throw new Error(`${context}: unbekannte Fertigkeit "${part}" (aus "${raw}")`);
    if (!out.includes(skill)) out.push(skill);
  }
  return out;
}

/** Zauberschule, Kreaturentyp und Gesinnung — hier aus demselben Zyklus-Grund wie `MONSTER_SIZES`. */
export const SPELL_SCHOOLS = {
  abjuration:    'Bannmagie',
  conjuration:   'Beschwörung',
  divination:    'Erkenntnismagie',
  enchantment:   'Verzauberung',
  evocation:     'Hervorrufung',
  illusion:      'Illusionsmagie',
  necromancy:    'Nekromantie',
  transmutation: 'Verwandlung',
} as const;
export type SpellSchool = keyof typeof SPELL_SCHOOLS;
export const SPELL_SCHOOL_KEYS = Object.keys(SPELL_SCHOOLS) as [SpellSchool, ...SpellSchool[]];

export const MONSTER_TYPES = {
  aberration:  'Aberration',
  beast:       'Tier',
  celestial:   'Himmlisches',
  construct:   'Konstrukt',
  dragon:      'Drache',
  elemental:   'Elementar',
  fey:         'Fee',
  fiend:       'Teuflisches',
  giant:       'Riese',
  humanoid:    'Humanoid',
  monstrosity: 'Ungeheuer',
  ooze:        'Schleim',
  plant:       'Pflanze',
  undead:      'Untote',
} as const;
export type MonsterType = keyof typeof MONSTER_TYPES;

export const MONSTER_ALIGNMENTS = {
  'lawful good':              'Rechtschaffen Gut',
  'neutral good':             'Neutral Gut',
  'chaotic good':             'Chaotisch Gut',
  'lawful neutral':           'Rechtschaffen Neutral',
  'neutral':                  'Neutral',
  'chaotic neutral':          'Chaotisch Neutral',
  'lawful evil':              'Rechtschaffen Böse',
  'neutral evil':             'Neutral Böse',
  'chaotic evil':             'Chaotisch Böse',
  'unaligned':                'Unausgerichtet',
  'any alignment':            'Beliebige Gesinnung',
  'any good alignment':       'Beliebige gute Gesinnung',
  'any evil alignment':       'Beliebige böse Gesinnung',
  'any non-good alignment':   'Beliebige nicht-gute Gesinnung',
  'any non-lawful alignment': 'Beliebige nicht-rechtschaffene Gesinnung',
  'any chaotic alignment':    'Beliebige chaotische Gesinnung',
  'any lawful alignment':     'Beliebige rechtschaffene Gesinnung',
} as const;
export type MonsterAlignment = keyof typeof MONSTER_ALIGNMENTS;

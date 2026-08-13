/**
 * Die Freitext-Parser des Monster-Altbestands: `speed`, `senses`, Würfelnotation und die
 * deutschen Regelwörter, die dort statt der englischen Vokabulare stehen.
 *
 * Alles hier ist Wegwerf-Code mit Verfallsdatum: die Tabellen bilden die tatsächlich im Vault
 * vorkommenden Schreibweisen ab, samt Tippfehlern („WEI", „kon", „Giftdamage"). Sie sind
 * bewusst KEIN Vokabular — das steht in `vocabulary.ts` und ist englisch.
 */
import { abilityKeyOf, type AbilityKey } from './abilities';
import {
  CONDITIONS,
  DAMAGE_DICE,
  readCondition,
  readDamageType,
  readSkillName,
  type Condition,
  type DamageDie,
  type DamageType,
  type SkillName,
} from './vocabulary';
import { SKILL_DEFS } from '../domain/skills';

const fold = (s: string): string => s.toLowerCase().replace(/[\s_.\-–—:]+/g, '').replace(/ß/g, 'ss');

/** 5 Fuß = 1,5 m, die Konvention des Bogens — nicht die exakte Umrechnung. */
export const metersToFeet = (m: number): number => Math.round(m / 1.5) * 5;

/**
 * Einheitenlose Zahlen sind zweideutig („30" ist Fuß, „9" Meter). Vielfache von 5 ab 20
 * sind im Bestand ausnahmslos Fuß, alles darunter metrisch.
 */
const toFeet = (value: number, unit: 'ft' | 'm' | null): number => {
  if (unit === 'ft') return value;
  if (unit === 'm') return metersToFeet(value);
  return value >= 20 && value % 5 === 0 ? value : metersToFeet(value);
};

const unitOf = (part: string): 'ft' | 'm' | null => {
  if (/ft|fuss|fuß|feet/i.test(part)) return 'ft';
  if (/\d\s*m\b|meter/i.test(part)) return 'm';
  return null;
};

const numberIn = (part: string): number | null => {
  const m = part.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

const splitList = (raw: string): string[] =>
  raw
    .split(/[,;/]|\bund\b|\band\b|\boder\b|\bor\b/gi)
    .map((s) => s.trim().replace(/^[-–—]\s*/, '').replace(/[.;]+$/, '').trim())
    .filter(Boolean);

// ── Bewegung ──────────────────────────────────────────────────────────────────

export interface LegacySpeed {
  walk: number;
  fly: number;
  swim: number;
  climb: number;
  burrow: number;
  hover: boolean;
}

const MOVEMENT_WORDS: [RegExp, keyof Omit<LegacySpeed, 'hover'>][] = [
  [/fliegen|flug|fly/i, 'fly'],
  [/schwimmen|swim/i, 'swim'],
  [/klettern|climb/i, 'climb'],
  [/graben|burrow/i, 'burrow'],
  [/gehen|laufen|walk/i, 'walk'],
];

const HOVER_WORDS = /schweb|hover/i;

/** „12 m, Klettern 9 m" · „0 ft., fliegen 50 ft., schweben" · „30" → Fuß je Bewegungsart. */
export function parseLegacySpeed(raw: unknown): LegacySpeed {
  const out: LegacySpeed = { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false };
  if (typeof raw === 'number') {
    out.walk = toFeet(raw, null);
    return out;
  }
  if (typeof raw !== 'string' || !raw.trim()) return out;

  const globalUnit = unitOf(raw);
  for (const part of splitList(raw)) {
    if (HOVER_WORDS.test(part)) out.hover = true;
    const value = numberIn(part);
    if (value === null) continue;
    const feet = toFeet(value, unitOf(part) ?? globalUnit);
    const hit = MOVEMENT_WORDS.find(([re]) => re.test(part));
    out[hit ? hit[1] : 'walk'] = feet;
  }
  return out;
}

// ── Sinne ─────────────────────────────────────────────────────────────────────

export interface LegacySenses {
  darkvision: number;
  blindsight: number;
  tremorsense: number;
  truesight: number;
}

const SENSE_WORDS: [RegExp, keyof LegacySenses][] = [
  [/dunkelsicht|darkvision|nachtsicht/i, 'darkvision'],
  [/blindsicht|blindsight/i, 'blindsight'],
  [/erschütterungssinn|erschuetterungssinn|tremorsense|erdgespür/i, 'tremorsense'],
  [/wahre\s*sicht|truesight/i, 'truesight'],
];

/**
 * „Dunkelsicht 18 m, passive Wahrnehmung 13" → `{darkvision: 60}`. Die passive Wahrnehmung
 * fällt weg: sie ist aus Weisheit und Wahrnehmungs-Bonus gerechnet, kein Datum.
 */
export function parseLegacySenses(raw: unknown): LegacySenses {
  const out: LegacySenses = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 };
  if (typeof raw !== 'string' || !raw.trim()) return out;

  const globalUnit = unitOf(raw);
  for (const part of splitList(raw)) {
    const hit = SENSE_WORDS.find(([re]) => re.test(part));
    if (!hit) continue;
    const value = numberIn(part);
    out[hit[1]] = value === null ? 0 : toFeet(value, unitOf(part) ?? globalUnit);
  }
  return out;
}

// ── Würfel ────────────────────────────────────────────────────────────────────

export interface LegacyDamageRoll {
  die_count: number;
  die_type?: DamageDie;
  bonus: number;
  type?: DamageType;
}

const DIE_TYPES = new Set<string>(DAMAGE_DICE);

/** „1W6+1" · „2d6+4" · „1" · „1d4+2" — deutsche W- und englische d-Notation. */
export function parseLegacyDice(raw: unknown): Omit<LegacyDamageRoll, 'type'> {
  const s = String(raw ?? '').trim().replace(/\s+/g, '');
  const dice = s.match(/^(\d+)[dDwW](\d+)([+-]\d+)?$/);
  if (dice) {
    const die = `D${dice[2]}`;
    return {
      die_count: Number(dice[1]),
      die_type: DIE_TYPES.has(die) ? (die as DamageDie) : undefined,
      bonus: dice[3] ? Number(dice[3]) : 0,
    };
  }
  const flat = s.match(/^([+-]?\d+)$/);
  return { die_count: 0, bonus: flat ? Number(flat[1]) : 0 };
}

/** „1/4" · „0" · 2 → Zahl. */
export function parseLegacyCr(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0.25;
}

// ── Deutsche Regelwörter → englische Vokabulare ───────────────────────────────

const DE_SKILLS = new Map<string, SkillName>([
  ...SKILL_DEFS.flatMap((d): [string, SkillName][] => [
    [fold(d.label), d.en],
    [fold(d.key), d.en],
  ]),
  ['arkana', 'Arcana'],
  ['einschüchterung', 'Intimidation'],
  ['tarnung', 'Stealth'],
  ['täuschung', 'Deception'],
  ['verstellung', 'Deception'],
  ['sportlichkeit', 'Athletics'],
]);

export const legacySkillName = (raw: string): SkillName | null =>
  DE_SKILLS.get(fold(raw)) ?? readSkillName(raw);

const DE_DAMAGE = new Map<string, DamageType>([
  ['hieb', 'slashing'], ['hiebschaden', 'slashing'], ['schneidend', 'slashing'],
  ['schlachten', 'slashing'], ['schlacht', 'slashing'],
  ['stich', 'piercing'], ['stichschaden', 'piercing'], ['stechen', 'piercing'],
  ['durchbohrung', 'piercing'],
  ['wucht', 'bludgeoning'], ['wuchtschaden', 'bludgeoning'], ['schlag', 'bludgeoning'],
  ['feuer', 'fire'], ['feuerschaden', 'fire'],
  ['kälte', 'cold'], ['kälteschaden', 'cold'], ['kalt', 'cold'], ['frost', 'cold'],
  ['blitz', 'lightning'], ['blitzschaden', 'lightning'],
  ['schall', 'thunder'], ['schallschaden', 'thunder'], ['donner', 'thunder'],
  ['säure', 'acid'], ['säureschaden', 'acid'],
  ['gift', 'poison'], ['giftschaden', 'poison'], ['giftig', 'poison'], ['giftdamage', 'poison'],
  ['nekrotisch', 'necrotic'], ['nekrotischerschaden', 'necrotic'],
  ['gleißend', 'radiant'], ['gleißenderschaden', 'radiant'], ['strahlend', 'radiant'],
  ['energie', 'force'], ['energieschaden', 'force'], ['zwangsenergie', 'force'],
  ['psychisch', 'psychic'], ['psycho', 'psychic'], ['psychoschaden', 'psychic'],
  ['psychischerschaden', 'psychic'], ['psychischeschaden', 'psychic'],
]);

const DE_CONDITIONS = new Map<string, Condition>([
  ...(Object.entries(CONDITIONS) as [Condition, string][]).map(
    ([key, label]): [string, Condition] => [fold(label), key],
  ),
  ['verzaubert', 'charmed'], ['charmiert', 'charmed'], ['verhext', 'charmed'],
  ['erschreckt', 'frightened'], ['angst', 'frightened'], ['furcht', 'frightened'],
  ['eingeschüchtert', 'frightened'], ['verängstig', 'frightened'],
  ['ermüdet', 'exhaustion'], ['erschöpft', 'exhaustion'], ['erschöpfung', 'exhaustion'],
  ['paralysiert', 'paralyzed'],
  ['gift', 'poisoned'], ['vergiftung', 'poisoned'],
  ['blind', 'blinded'],
]);

/** Was keine Zuordnung findet, ist Prosa und wandert in `*_desc` statt verloren zu gehen. */
export interface LegacyVocabularyList<T> {
  values: T[];
  leftovers: string[];
}

function readList<T>(
  raw: unknown,
  lookup: (part: string) => T | null,
): LegacyVocabularyList<T> {
  const values: T[] = [];
  const leftovers: string[] = [];
  const entries = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];

  for (const entry of entries) {
    // Ein Eintrag kann mehrere Werte tragen: „Gift, Psychisch" stand so als EIN Listenglied.
    for (const part of splitList(String(entry ?? ''))) {
      const direct = lookup(part);
      if (direct) {
        if (!values.includes(direct)) values.push(direct);
        continue;
      }
      // „Hiebschaden durch nicht-magische Waffen": das erste Wort trägt die Art,
      // der Rest ist die Einschränkung und bleibt als Prosa erhalten.
      const words = part.split(/\s+/);
      const head = words.length > 1 ? lookup(words[0]) : null;
      if (head) {
        if (!values.includes(head)) values.push(head);
        leftovers.push(words.slice(1).join(' '));
      } else if (part) {
        leftovers.push(part);
      }
    }
  }
  return { values, leftovers };
}

export const legacyDamageTypes = (raw: unknown): LegacyVocabularyList<DamageType> =>
  readList(raw, (part) => DE_DAMAGE.get(fold(part)) ?? readDamageType(part));

export const legacyConditions = (raw: unknown): LegacyVocabularyList<Condition> =>
  readList(raw, (part) => DE_CONDITIONS.get(fold(part)) ?? readCondition(part));

const DE_ABILITY = new Map<string, AbilityKey>([
  ['stä', 'str'], ['sta', 'str'], ['stärke', 'str'],
  ['ges', 'dex'], ['geschicklichkeit', 'dex'],
  ['kon', 'con'], ['konstitution', 'con'],
  ['int', 'int'], ['intelligenz', 'int'],
  ['wei', 'wis'], ['weisheit', 'wis'],
  ['cha', 'cha'], ['charisma', 'cha'],
]);

/** `{"STR":"+5"}` · `{"kon":"+1"}` · `{"WEI":"+2"}` → `{str: 5}`. */
export function legacyAbilityBonuses(raw: unknown): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ability = abilityKeyOf(key) ?? DE_ABILITY.get(fold(key));
    if (!ability) continue;
    const n = numberIn(String(value ?? ''));
    if (n !== null) out[ability] = n;
  }
  return out;
}

export function legacySkillBonuses(raw: unknown): Partial<Record<SkillName, number>> {
  const out: Partial<Record<SkillName, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const skill = legacySkillName(key);
    if (!skill) continue;
    const n = numberIn(String(value ?? ''));
    if (n !== null) out[skill] = n;
  }
  return out;
}

/** Prosa („Versteht alle Sprachen, …") gehört nicht in die Liste, sondern in `languages_desc`. */
export function parseLegacyLanguages(raw: unknown): { languages: string[]; desc: string } {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s === '-' || s === '—') return { languages: [], desc: '' };

  const languages: string[] = [];
  const desc: string[] = [];
  for (const part of s.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    // Ein Sprachname ist ein bis zwei Wörter; alles Längere ist ein Satz.
    if (part.split(/\s+/).length <= 2 && !/\bkann\b|\bversteh|\bspricht\b/i.test(part)) {
      languages.push(part);
    } else {
      desc.push(part);
    }
  }
  return { languages, desc: desc.join(', ') };
}

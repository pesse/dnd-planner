/**
 * Rohe Open5e-v2-Kreatur → internes `Monster`-Schema. Wie die anderen Mapper ohne `invoke`,
 * damit `scripts/import-open5e-creatures.mts` ihn bündeln kann. Namen und Texte bleiben
 * englisch — das gepflegte Deutsch setzt der Importer per `name_en`-Match.
 */
import { MONSTER_ACTION_TYPES, type Monster, type MonsterAction, type MonsterAttack, type MonsterDamageRoll } from '../schemas/monster';
import {
  DAMAGE_DICE,
  MONSTER_ALIGNMENTS,
  MONSTER_SIZES,
  MONSTER_TYPES,
  readCondition,
  readDamageType,
  readSkillName,
  type Condition,
  type DamageDie,
  type DamageType,
  type MonsterAlignment,
  type MonsterSize,
  type MonsterType,
  type SkillName,
} from '../schemas/vocabulary';
import { abilityKeyOf, abilityRecordOf, type AbilityKey, type AbilityStats } from '../schemas/abilities';
import { mod } from '$lib/domain/skills';
import { numOr } from '$lib/utils/num';
import { capitalize, DEFAULT_DOCUMENT } from './open5eSource';

interface Open5eNamed { name?: string; key?: string }

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : [];

/** Fällt der Wert aus dem Vokabular, gilt der Ersatz — ein Parse-Gate im Importer fängt den Rest. */
function pickKey<T extends string>(table: Record<string, unknown>, raw: string, fallback: T): T {
  return raw in table ? (raw as T) : fallback;
}

const damageKeys = (value: unknown): DamageType[] =>
  list(value)
    .map((e) => readDamageType(str((e as Open5eNamed).key) || str((e as Open5eNamed).name)))
    .filter((d): d is DamageType => d !== null);

const conditionKeys = (value: unknown): Condition[] =>
  list(value)
    .map((e) => readCondition(str((e as Open5eNamed).key) || str((e as Open5eNamed).name)))
    .filter((c): c is Condition => c !== null);

/** Open5e schreibt die Attribute aus: `{"strength": 30, …}`. */
function abilityScores(value: unknown): AbilityStats {
  const out = abilityRecordOf(() => 10);
  for (const [name, score] of Object.entries(record(value))) {
    const key = abilityKeyOf(name);
    if (key) out[key] = Math.round(numOr(score, 10));
  }
  return out;
}

/**
 * Open5e führt `saving_throws` für ALLE sechs Attribute, auch ungeübte (der uralte rote Drache
 * trägt dort STÄ +10 = sein blanker Modifikator). Geübt ist, was vom Modifikator abweicht —
 * alles andere rechnet `saveBonus` selbst und würde als gespeicherter Wert nur driften.
 */
function savingThrows(value: unknown, scores: AbilityStats): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const [name, bonus] of Object.entries(record(value))) {
    const key = abilityKeyOf(name);
    if (!key) continue;
    const rounded = Math.round(numOr(bonus));
    if (rounded !== mod(scores[key])) out[key] = rounded;
  }
  return out;
}

function skillBonuses(value: unknown): Partial<Record<SkillName, number>> {
  const out: Partial<Record<SkillName, number>> = {};
  for (const [name, bonus] of Object.entries(record(value))) {
    const skill = readSkillName(name);
    if (skill) out[skill] = Math.round(numOr(bonus));
  }
  return out;
}

/**
 * `as_string` ist die vollständige Wahrheit, `data` nur die erkannten Sprachen. Deckt sich der
 * Kopf mit der Liste, bleibt sie strukturiert; sonst wandert die Prosa als EIN Freitext-Eintrag
 * hinein („Understands Common but can't speak"). Beides zusammen ergibt wieder das Original.
 */
function languagesOf(value: unknown): { languages: string[]; languages_desc: string } {
  const langs = record(value);
  const full = str(langs.as_string);
  if (!full) return { languages: [], languages_desc: '' };

  const cut = full.indexOf(';');
  const head = cut === -1 ? full : full.slice(0, cut).trim();
  const desc = cut === -1 ? '' : full.slice(cut + 1).trim();
  const names = list(langs.data).map((e) => str((e as Open5eNamed).name)).filter(Boolean);

  return { languages: names.join(', ') === head ? names : [head], languages_desc: desc };
}

function damageRoll(
  count: unknown,
  die: unknown,
  bonus: unknown,
  type: unknown,
): MonsterDamageRoll | undefined {
  const dieType = String(die ?? '').toUpperCase();
  const roll: MonsterDamageRoll = {
    die_count: Math.round(numOr(count)),
    bonus: Math.round(numOr(bonus)),
  };
  if ((DAMAGE_DICE as readonly string[]).includes(dieType)) roll.die_type = dieType as DamageDie;
  const damageType = readDamageType(str((type as Open5eNamed | null)?.key));
  if (damageType) roll.type = damageType;
  return roll.die_count || roll.bonus || roll.type ? roll : undefined;
}

/**
 * `reach`/`range`/`long_range` stehen bei Open5e auf `null`, wenn sie nicht gelten. Nicht über
 * `numOr` lesen: `Number(null)` ist 0, und eine Reichweite von 0 Fuß ist eine Aussage.
 */
function feet(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function mapAttack(raw: Record<string, unknown>): MonsterAttack {
  const attack: MonsterAttack = {
    name: str(raw.name),
    attack_type: str(raw.attack_type) === 'SPELL' ? 'SPELL' : 'WEAPON',
    to_hit_mod: Math.round(numOr(raw.to_hit_mod)),
    target_creature_only: Boolean(raw.target_creature_only),
  };
  const reach = feet(raw.reach);
  const range = feet(raw.range);
  const longRange = feet(raw.long_range);
  if (reach !== undefined) attack.reach = reach;
  if (range !== undefined) attack.range = range;
  if (longRange !== undefined) attack.long_range = longRange;

  const damage = damageRoll(raw.damage_die_count, raw.damage_die_type, raw.damage_bonus, raw.damage_type);
  const extra = damageRoll(
    raw.extra_damage_die_count,
    raw.extra_damage_die_type,
    raw.extra_damage_bonus,
    raw.extra_damage_type,
  );
  if (damage) attack.damage = damage;
  if (extra) attack.extra_damage = extra;
  return attack;
}

const USAGE_TYPES = ['PER_DAY', 'RECHARGE', 'RECHARGE_ON_ROLL'] as const;

function mapAction(raw: Record<string, unknown>): MonsterAction {
  const actionType = str(raw.action_type) as (typeof MONSTER_ACTION_TYPES)[number];
  // Die Formbindung („Bat or Vampire Form Only") gehört im Statblock in die Aktionszeile —
  // ohne sie liest sich der Gestaltwandler, als könnte er alles in jeder Form.
  const form = str(raw.limited_to_form);
  const name = form ? `${str(raw.name)} (${form})` : str(raw.name);

  const action: MonsterAction = {
    name,
    name_en: name,
    desc: str(raw.desc),
    desc_en: str(raw.desc),
    action_type: MONSTER_ACTION_TYPES.includes(actionType) ? actionType : 'ACTION',
    legendary_action_cost: Math.round(numOr(raw.legendary_action_cost, 1)),
    attacks: list(raw.attacks).map(mapAttack),
  };

  const usage = record(raw.usage_limits);
  const usageType = str(usage.type) as (typeof USAGE_TYPES)[number];
  if (USAGE_TYPES.includes(usageType)) {
    action.usage_limits = { type: usageType, param: Math.round(numOr(usage.param)) };
  }
  return action;
}

/** Die API liefert alphabetisch; `order_in_statblock` je Aktionsart ist die gedruckte Reihenfolge. */
const actionOrder = (raw: Record<string, unknown>): number =>
  MONSTER_ACTION_TYPES.indexOf(str(raw.action_type) as (typeof MONSTER_ACTION_TYPES)[number]) * 1000 +
  numOr(raw.order_in_statblock);

export function mapOpen5eCreature(raw: Record<string, unknown>): Monster {
  const doc = record(raw.document);
  const senses = {
    darkvision: Math.round(numOr(raw.darkvision_range)),
    blindsight: Math.round(numOr(raw.blindsight_range)),
    tremorsense: Math.round(numOr(raw.tremorsense_range)),
    truesight: Math.round(numOr(raw.truesight_range)),
  };
  const speed = record(raw.speed);
  const defenses = record(raw.resistances_and_immunities);
  const name = str(raw.name);
  const scores = abilityScores(raw.ability_scores);

  return {
    key: str(raw.key),
    source: (str(doc.key) || DEFAULT_DOCUMENT) as Monster['source'],
    name,
    name_en: name,
    size: pickKey<MonsterSize>(MONSTER_SIZES, capitalize(str(record(raw.size).key)), 'Medium'),
    type: pickKey<MonsterType>(MONSTER_TYPES, str(record(raw.type).key), 'humanoid'),
    alignment: pickKey<MonsterAlignment>(MONSTER_ALIGNMENTS, str(raw.alignment), 'unaligned'),
    challenge_rating: numOr(raw.challenge_rating),
    xp: Math.round(numOr(raw.experience_points)),
    armor_class: Math.round(numOr(raw.armor_class, 10)),
    armor_detail: str(raw.armor_detail),
    hit_points: Math.round(numOr(raw.hit_points)),
    hit_dice: str(raw.hit_dice),
    ability_scores: scores,
    saving_throws: savingThrows(raw.saving_throws, scores),
    skill_bonuses: skillBonuses(raw.skill_bonuses),
    speed: {
      walk: Math.round(numOr(speed.walk)),
      fly: Math.round(numOr(speed.fly)),
      swim: Math.round(numOr(speed.swim)),
      climb: Math.round(numOr(speed.climb)),
      burrow: Math.round(numOr(speed.burrow)),
      hover: Boolean(speed.hover),
    },
    senses,
    ...languagesOf(raw.languages),
    damage_resistances: damageKeys(defenses.damage_resistances),
    damage_immunities: damageKeys(defenses.damage_immunities),
    damage_vulnerabilities: damageKeys(defenses.damage_vulnerabilities),
    condition_immunities: conditionKeys(defenses.condition_immunities),
    defenses_desc: '',
    traits: list(raw.traits).map((t) => ({
      name: str(t.name),
      name_en: str(t.name),
      desc: str(t.desc),
      desc_en: str(t.desc),
    })),
    actions: list(raw.actions)
      .slice()
      .sort((a, b) => actionOrder(a) - actionOrder(b))
      .map(mapAction),
    tags: [],
  };
}

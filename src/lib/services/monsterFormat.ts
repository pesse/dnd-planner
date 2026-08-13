/**
 * Die deutsche Textform eines Monsters. Statblock, Kompaktkarte, Encounter-Druck und
 * Kontext-Prompt zeigen dieselben Zeilen — gespeichert sind Fuß und englische Schlüssel,
 * hier werden sie zu Metern und Labels.
 */
import { ftToM } from '../itemFormat';
import { sign } from '../utils/num';
import { DAMAGE_TYPE_LABELS } from '../itemLabels';
import { CONDITIONS, type Condition, type DamageType, type SkillName } from '../schemas/vocabulary';
import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../schemas/abilities';
import { skillLabelDe } from '../domain/skills';
import { passivePerception, saveBonus, skillBonus } from './monsterDerived';
import type { Monster, MonsterAction, MonsterAttack, MonsterDamageRoll } from '../schemas/monster';

/** 0.25 → „1/4"; die Brüche sind die einzige Stelle, an der HG nicht als Zahl liest. */
export function crLabel(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** Umkehrung fürs Eingabefeld: „1/4" und „0,25" ergeben beide 0.25. */
export function parseCr(raw: string): number {
  const s = raw.trim().replace(',', '.');
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(s) || 0;
}

const MOVEMENT_LABELS: Record<Exclude<keyof Monster['speed'], 'walk' | 'hover'>, string> = {
  fly: 'Fliegen',
  swim: 'Schwimmen',
  climb: 'Klettern',
  burrow: 'Graben',
};

export function speedLine(speed: Monster['speed']): string {
  const parts = speed.walk ? [ftToM(speed.walk)] : [];
  for (const [key, label] of Object.entries(MOVEMENT_LABELS)) {
    const value = speed[key as keyof typeof MOVEMENT_LABELS];
    if (value) parts.push(`${label} ${ftToM(value)}${key === 'fly' && speed.hover ? ' (schwebend)' : ''}`);
  }
  return parts.join(', ') || '—';
}

const SENSE_LABELS: Record<keyof Monster['senses'], string> = {
  darkvision: 'Dunkelsicht',
  blindsight: 'Blindsicht',
  tremorsense: 'Erschütterungssinn',
  truesight: 'Wahre Sicht',
};

/** Inklusive passiver Wahrnehmung — die steht auf jedem Statblock, ist aber abgeleitet. */
export function sensesLine(monster: Monster): string {
  const parts = Object.entries(SENSE_LABELS)
    .filter(([key]) => monster.senses[key as keyof Monster['senses']])
    .map(([key, label]) => `${label} ${ftToM(monster.senses[key as keyof Monster['senses']])}`);
  parts.push(`passive Wahrnehmung ${passivePerception(monster)}`);
  return parts.join(', ');
}

export const damageTypeLabel = (type: DamageType | string): string => DAMAGE_TYPE_LABELS[type] ?? type;

export const conditionLabel = (key: Condition | string): string =>
  CONDITIONS[key as Condition] ?? key;

/** Listen und `defenses_desc` in einer Zeile; die Prosa hängt hinten an. */
export function damageLine(types: DamageType[], extra = ''): string {
  const list = types.map(damageTypeLabel).join(', ');
  return [list, extra].filter(Boolean).join('; ');
}

export const conditionLine = (keys: Condition[]): string => keys.map(conditionLabel).join(', ');

export function languagesLine(monster: Monster): string {
  return [monster.languages.join(', '), monster.languages_desc].filter(Boolean).join('; ') || '—';
}

/** Nur die geübten — ungeübte Werte rechnet der Leser aus dem Attribut selbst. */
export function savesLine(monster: Monster): string {
  return ABILITY_KEYS.filter((k) => monster.saving_throws[k] !== undefined)
    .map((k) => `${ABILITY_ABBR_DE[k]} ${sign(saveBonus(monster, k))}`)
    .join(', ');
}

export function skillsLine(monster: Monster): string {
  return (Object.keys(monster.skill_bonuses) as SkillName[])
    .map((s) => `${skillLabelDe(s)} ${sign(skillBonus(monster, s))}`)
    .join(', ');
}

/** „2W6+3" — deutsche Würfelschreibweise, ohne Schadensart. */
export function diceText(roll: MonsterDamageRoll): string {
  const dice = roll.die_type && roll.die_count ? `${roll.die_count}W${roll.die_type.slice(1)}` : '';
  const bonus = roll.bonus ? (dice ? sign(roll.bonus) : String(roll.bonus)) : '';
  return `${dice}${bonus}` || '—';
}

const damageText = (roll: MonsterDamageRoll): string =>
  [diceText(roll), roll.type ? damageTypeLabel(roll.type) : ''].filter(Boolean).join(' ');

/** „+5 zum Angriff, Reichweite 1,5 m: 2W6+3 Hieb, dazu 1W6 Feuer" */
export function attackLine(attack: MonsterAttack): string {
  const range = attack.reach
    ? `Reichweite ${ftToM(attack.reach)}`
    : attack.range
      ? `Distanz ${ftToM(attack.range)}${attack.long_range ? `/${ftToM(attack.long_range)}` : ''}`
      : '';
  const head = [`${sign(attack.to_hit_mod)} zum Angriff`, range].filter(Boolean).join(', ');
  const damage = [
    attack.damage ? damageText(attack.damage) : '',
    attack.extra_damage ? `dazu ${damageText(attack.extra_damage)}` : '',
  ].filter(Boolean).join(', ');
  return damage ? `${head}: ${damage}` : head;
}

/** „Aufladung 5–6", „3/Tag" — das Suffix hinter dem Aktionsnamen. */
export function usageLimitLabel(limits: Monster['actions'][number]['usage_limits']): string {
  if (!limits) return '';
  if (limits.type === 'PER_DAY') return `${limits.param}/Tag`;
  if (limits.type === 'RECHARGE') return `Aufladung ${limits.param}`;
  return `Aufladung ${limits.param}${limits.param < 6 ? '–6' : ''}`;
}

export const actionTitle = (action: MonsterAction): string => {
  const limit = usageLimitLabel(action.usage_limits);
  const cost = action.action_type === 'LEGENDARY_ACTION' && action.legendary_action_cost > 1
    ? `Kosten ${action.legendary_action_cost}`
    : '';
  const suffix = [limit, cost].filter(Boolean).join(', ');
  return suffix ? `${action.name} (${suffix})` : action.name;
};

export const ACTION_GROUP_LABELS: Record<MonsterAction['action_type'], string> = {
  ACTION: 'Aktionen',
  BONUS_ACTION: 'Bonusaktionen',
  REACTION: 'Reaktionen',
  LEGENDARY_ACTION: 'Legendäre Aktionen',
};

const GROUP_ORDER = Object.keys(ACTION_GROUP_LABELS) as MonsterAction['action_type'][];

export interface ActionGroup {
  type: MonsterAction['action_type'];
  label: string;
  actions: MonsterAction[];
}

/** Die eine Liste in ihre Abschnitte, leere Gruppen fallen weg. */
export function actionGroups(monster: Monster): ActionGroup[] {
  return GROUP_ORDER.map((type) => ({
    type,
    label: ACTION_GROUP_LABELS[type],
    actions: monster.actions.filter((a) => a.action_type === type),
  })).filter((g) => g.actions.length > 0);
}

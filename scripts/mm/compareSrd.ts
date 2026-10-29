/**
 * Abgleich eines MM-Statblocks mit dem SRD-Monster des Vaults. Verglichen wird nur, was beide
 * Quellen führen: Werte, englische Texte, Aufladungen und Angriffe — nicht das Deutsch.
 */
import type { Monster, MonsterAction } from '$lib/schemas/monster';

export interface FieldDiff {
  field: string;
  mm: unknown;
  srd: unknown;
}

/** Open5e lässt „Hit:" weg und schreibt Listen anders um; beides ist keine inhaltliche Abweichung. */
export const text = (s: string): string =>
  s
    .replace(/\bHit: /g, '')
    .replace(/- \*\*([^*]+?)[:.]\*\*/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const sorted = (xs: string[]) => [...xs].sort();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const SCALARS = [
  'size', 'type', 'alignment', 'challenge_rating', 'xp', 'armor_class', 'hit_points', 'hit_dice',
  'ability_scores', 'saving_throws', 'skill_bonuses', 'speed', 'senses',
] as const;

const LISTS = ['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities'] as const;

/** Formbindung und Aufladung stehen bei Open5e mal im Namen, mal daneben. */
const baseName = (name: string) => name.replace(/\s*\((?:Recharge [^)]*|\d+\/Day[^)]*)\)/i, '').replace(/\s+/g, ' ').trim();

function attacks(a: MonsterAction): unknown {
  return a.attacks.map(({ to_hit_mod, reach, range, long_range, damage, extra_damage }) => ({
    to_hit_mod, reach, range, long_range, damage, extra_damage,
  }));
}

export function compareWithSrd(mm: Monster, srd: Monster): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const push = (field: string, a: unknown, b: unknown) => {
    if (!same(a, b)) diffs.push({ field, mm: a, srd: b });
  };
  for (const f of SCALARS) push(f, mm[f], srd[f]);
  for (const f of LISTS) push(f, sorted(mm[f]), sorted(srd[f]));

  push('traits', mm.traits.map((t) => t.name_en), srd.traits.map((t) => t.name_en));
  for (const t of mm.traits) {
    const s = srd.traits.find((x) => x.name_en === t.name_en);
    if (s) push(`trait ${t.name_en}`, text(t.desc_en), text(s.desc_en));
  }

  const key = (a: MonsterAction) => `${a.action_type}:${baseName(a.name_en)}`;
  push('actions', mm.actions.map(key), srd.actions.map(key));
  for (const a of mm.actions) {
    const s = srd.actions.find((x) => key(x) === key(a));
    if (!s) continue;
    push(`action ${a.name_en}`, text(a.desc_en), text(s.desc_en));
    push(`action ${a.name_en} usage`, a.usage_limits ?? null, s.usage_limits ?? null);
    if (a.action_type === 'LEGENDARY_ACTION') push(`action ${a.name_en} cost`, a.legendary_action_cost, s.legendary_action_cost);
    if (a.attacks.length && s.attacks.length) push(`action ${a.name_en} attacks`, attacks(a), attacks(s));
  }
  return diffs;
}

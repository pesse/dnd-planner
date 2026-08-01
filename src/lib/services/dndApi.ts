/**
 * Zugriffe auf dnd5eapi.co — nur noch für Monster, alles andere kommt aus Open5e v2.
 * Läuft über das Tauri-`http_request`-Kommando statt `fetch`, sonst blockt CORS.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Monster } from '../types';

export const DND_API = 'https://www.dnd5eapi.co/api/2014';

export interface DndApiRef {
  index: string;
  name: string;
  url: string;
}

export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

export async function searchMonsters(q: string): Promise<DndApiRef[]> {
  const raw = (await apiGet(`${DND_API}/monsters?name=${encodeURIComponent(q)}`)) as Record<string, unknown>;
  return (raw.results as DndApiRef[]) ?? [];
}

/** Nimmt beides: `/api/2014/monsters/goblin` oder eine volle URL. */
export async function getResource(urlOrPath: string): Promise<Record<string, unknown>> {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `https://www.dnd5eapi.co${urlOrPath}`;
  return (await apiGet(url)) as Record<string, unknown>;
}

function crFromNumber(n: number): string {
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  return String(n);
}

/** 5 ft = 1,5 m, mit deutschem Komma; die Eingabe kommt als "30" oder "30 ft.". */
function ftToM(val: string | number): string {
  const n = typeof val === 'string' ? parseInt(val) : val;
  return `${Math.round(n * 3) / 10} m`.replace('.', ',');
}

function buildSpeed(speed: Record<string, string | number>): string {
  const parts: string[] = [];
  if (speed.walk) parts.push(ftToM(speed.walk));
  if (speed.fly) parts.push(`Fliegen ${ftToM(speed.fly)}`);
  if (speed.swim) parts.push(`Schwimmen ${ftToM(speed.swim)}`);
  if (speed.climb) parts.push(`Klettern ${ftToM(speed.climb)}`);
  if (speed.burrow) parts.push(`Graben ${ftToM(speed.burrow)}`);
  return parts.join(', ') || '—';
}

function buildSenses(senses: Record<string, string | number>): string {
  const NAMES: Record<string, string> = {
    blindsight: 'Blindsicht', darkvision: 'Dunkelsicht', tremorsense: 'Erschütterungssinn', truesight: 'Wahre Sicht',
  };
  const parts: string[] = [];
  for (const [k, label] of Object.entries(NAMES)) {
    if (senses[k]) parts.push(`${label} ${ftToM(String(senses[k]).replace(' ft.', ''))}`);
  }
  if (senses.passive_perception) parts.push(`passive Wahrnehmung ${senses.passive_perception}`);
  return parts.join(', ') || '—';
}

const DAMAGE_TYPE_DE: Record<string, string> = {
  acid: 'Säure', bludgeoning: 'Wucht', cold: 'Kälte', fire: 'Feuer', force: 'Energie', lightning: 'Blitz',
  necrotic: 'Nekrose', piercing: 'Stich', poison: 'Gift', psychic: 'Psyche', radiant: 'Strahlung', slashing: 'Hieb', thunder: 'Donner',
};
const translateDamageType = (name: string): string => DAMAGE_TYPE_DE[name.toLowerCase()] ?? name;
const translateDice = (dice: string): string => dice.replace(/d(\d)/g, 'W$1');

const SKILL_DE: Record<string, string> = {
  'skill-athletics': 'Athletik', 'skill-acrobatics': 'Akrobatik', 'skill-sleight-of-hand': 'Fingerfertigkeit',
  'skill-stealth': 'Heimlichkeit', 'skill-arcana': 'Arkanes', 'skill-history': 'Geschichte',
  'skill-investigation': 'Nachforschung', 'skill-nature': 'Naturkunde', 'skill-religion': 'Religion',
  'skill-animal-handling': 'Tierführung', 'skill-insight': 'Einsicht', 'skill-medicine': 'Medizin',
  'skill-perception': 'Wahrnehmung', 'skill-survival': 'Überlebenskunst', 'skill-deception': 'Täuschung',
  'skill-intimidation': 'Einschüchterung', 'skill-performance': 'Auftreten', 'skill-persuasion': 'Überredung',
};

type ProfEntry = { value: number; proficiency: { index: string; name: string } };

function extractSavingThrows(profs: ProfEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of profs) {
    const m = p.proficiency.index.match(/^saving-throw-(.+)$/);
    if (m) result[m[1].toUpperCase()] = p.value >= 0 ? `+${p.value}` : `${p.value}`;
  }
  return result;
}

function extractSkills(profs: ProfEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of profs) {
    if (!p.proficiency.index.startsWith('skill-')) continue;
    const name = SKILL_DE[p.proficiency.index] ?? p.proficiency.name.replace('Skill: ', '');
    result[name] = p.value >= 0 ? `+${p.value}` : `${p.value}`;
  }
  return result;
}

function mapMonsterActions(arr: Array<Record<string, unknown>>): Monster['actions'] {
  return arr.map((a) => {
    const action: Monster['actions'][number] = { name: String(a.name ?? ''), description: String(a.desc ?? '') };
    if (a.attack_bonus != null) action.attack_bonus = Number(a.attack_bonus);
    const dmgArr = (a.damage as Array<{ damage_dice: string; damage_type: { name: string } }> | undefined) ?? [];
    if (dmgArr.length) action.damage = dmgArr.map((d) => ({ dice: translateDice(d.damage_dice), type: translateDamageType(d.damage_type.name) }));
    return action;
  });
}

/** Übersetzt beim Abbilden: Reichweiten in Meter, Schadensarten und Fertigkeiten ins Deutsche. */
export function mapApiResourceToMonster(d: Record<string, unknown>): Monster {
  const profs = (d.proficiencies as ProfEntry[]) ?? [];
  const acArr = (d.armor_class as Array<{ value: number; type: string }> | undefined) ?? [];
  const acNote = acArr.length > 1
    ? acArr.slice(1).map((a) => a.type).join(', ')
    : (acArr[0]?.type !== 'dex' ? (acArr[0]?.type ?? '') : '');

  return {
    index: d.index as string,
    source: 'srd-2024',
    name: d.name as string,
    size: d.size as Monster['size'],
    type: d.type as Monster['type'],
    alignment: d.alignment as Monster['alignment'],
    ac: { value: acArr[0]?.value ?? 10, note: acNote },
    hp: { average: d.hit_points as number, formula: (d.hit_points_roll as string) ?? (d.hit_dice as string) ?? '' },
    speed: buildSpeed((d.speed as Record<string, string | number>) ?? {}),
    stats: {
      str: d.strength as number, dex: d.dexterity as number, con: d.constitution as number,
      int: d.intelligence as number, wis: d.wisdom as number, cha: d.charisma as number,
    },
    saving_throws: extractSavingThrows(profs),
    skills: extractSkills(profs),
    damage_resistances: (d.damage_resistances as string[]) ?? [],
    damage_immunities: (d.damage_immunities as string[]) ?? [],
    condition_immunities: ((d.condition_immunities as Array<{ name: string }> | string[]) ?? []).map((c) => (typeof c === 'string' ? c : c.name)),
    senses: buildSenses((d.senses as Record<string, string | number>) ?? {}),
    languages: (d.languages as string) ?? '—',
    cr: crFromNumber(d.challenge_rating as number),
    xp: (d.xp as number) ?? 0,
    traits: mapMonsterActions((d.special_abilities as Array<Record<string, unknown>>) ?? []),
    actions: mapMonsterActions((d.actions as Array<Record<string, unknown>>) ?? []),
    reactions: mapMonsterActions((d.reactions as Array<Record<string, unknown>>) ?? []),
    legendary_actions: mapMonsterActions((d.legendary_actions as Array<Record<string, unknown>>) ?? []),
  };
}

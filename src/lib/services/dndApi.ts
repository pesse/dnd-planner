/**
 * Geteilte Zugriffe auf die offizielle D&D-5e-SRD-API (dnd5eapi.co).
 *
 * Läuft über das Tauri-`http_request`-Kommando (Rust/reqwest) — umgeht die
 * CORS-Beschränkung des Webviews, genau wie der LLM-HTTP-Pfad. Wird sowohl von
 * der `ItemCard` (manueller Import) als auch vom KI-Tool-Executor genutzt.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item, Monster, Spell } from '../types';
import { SPELL_SCHOOLS } from '../types';

export const DND_API = 'https://www.dnd5eapi.co/api/2014';

export interface DndApiRef {
  index: string;
  name: string;
  url: string;
}

/** Such-Treffer aus der DnD-API inkl. Quell-Kategorie und deutschem Tag. */
export interface DndApiItemRef extends DndApiRef {
  source: 'magic' | 'equipment';
  tag: string;
}

/** GET gegen die DnD-API via Rust-HTTP; liefert das geparste JSON. */
export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

type ApiCategory = 'equipment' | 'magic-items' | 'monsters' | 'spells';

async function searchCategory(category: ApiCategory, q: string): Promise<DndApiRef[]> {
  const raw = (await apiGet(`${DND_API}/${category}?name=${encodeURIComponent(q)}`)) as Record<string, unknown>;
  return (raw.results as DndApiRef[]) ?? [];
}

export const searchEquipment = (q: string): Promise<DndApiRef[]> => searchCategory('equipment', q);
export const searchMagicItems = (q: string): Promise<DndApiRef[]> => searchCategory('magic-items', q);
export const searchMonsters = (q: string): Promise<DndApiRef[]> => searchCategory('monsters', q);
export const searchSpells = (q: string): Promise<DndApiRef[]> => searchCategory('spells', q);

/** Holt eine vollständige Ressource per API-URL (relativ wie `/api/2014/equipment/warhammer` oder absolut). */
export async function getResource(urlOrPath: string): Promise<Record<string, unknown>> {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `https://www.dnd5eapi.co${urlOrPath}`;
  return (await apiGet(url)) as Record<string, unknown>;
}

/**
 * Durchsucht Ausrüstung und magische Gegenstände der DnD-API gleichzeitig und
 * liefert maximal 15 kombinierte Treffer (magisch zuerst).
 */
export async function searchDndApiItems(q: string): Promise<DndApiItemRef[]> {
  const [magicRaw, equipRaw] = await Promise.all([
    apiGet(`${DND_API}/magic-items?name=${encodeURIComponent(q)}`),
    apiGet(`${DND_API}/equipment?name=${encodeURIComponent(q)}`),
  ]);
  const magic = ((magicRaw as Record<string, unknown>).results as DndApiRef[] ?? [])
    .map((r) => ({ ...r, source: 'magic' as const, tag: 'magisch' }));
  const equip = ((equipRaw as Record<string, unknown>).results as DndApiRef[] ?? [])
    .map((r) => ({ ...r, source: 'equipment' as const, tag: 'ausrüstung' }));
  return [...magic, ...equip].slice(0, 15);
}

/**
 * Wandelt eine rohe DnD-API-Ressource (via {@link getResource}) in unser
 * `Item`-Schema. Übernimmt Spielwerte 1:1; `equipment_category` (die einzige
 * Typ-Quelle) kommt direkt aus der API und extrahiert die Einstimmung aus der
 * Beschreibung magischer Gegenstände. `source` ist immer `"SRD"`.
 */
export function mapApiResourceToItem(
  data: Record<string, unknown>,
  source: 'magic' | 'equipment',
): Item {
  let descArr = (data.desc as string[]) ?? [];
  let attunement = false;
  let attunement_by: string | null = null;

  if (source === 'magic') {
    const firstLine = descArr[0] ?? '';
    if (firstLine.toLowerCase().includes('requires attunement')) {
      attunement = true;
      const match = firstLine.match(/requires attunement(?: by ([^)]+))?/i);
      attunement_by = match?.[1]?.trim() ?? null;
      descArr = descArr.length > 1 ? descArr.slice(1) : descArr;
    }
  }

  // equipment_category ist die einzige Typ-Quelle. Die API liefert sie granular mit;
  // fehlt sie ausnahmsweise (manche magischen Gegenstände), sinnvoll defaulten.
  let equipment_category = data.equipment_category as Item['equipment_category'];
  if (!equipment_category?.index) {
    const idx = source === 'magic' ? 'wondrous-items'
      : data.weapon_category ? 'weapon'
      : (data.armor_category || data.armor_class) ? 'armor'
      : 'adventuring-gear';
    const name = idx.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    equipment_category = { index: idx, name };
  }

  return {
    index:                data.index as string,
    name:                 data.name as string,
    name_de:              undefined,
    equipment_category,
    rarity:               data.rarity as Item['rarity'],
    attunement,
    attunement_by,
    variant:              data.variant as boolean | undefined,
    variants:             data.variants as string[] | undefined,
    weapon_category:      data.weapon_category as string | undefined,
    weapon_range:         data.weapon_range as string | undefined,
    damage:               data.damage as Item['damage'],
    two_handed_damage:    data.two_handed_damage as Item['two_handed_damage'],
    range:                data.range as Item['range'],
    throw_range:          data.throw_range as Item['throw_range'],
    properties:           data.properties as Item['properties'],
    armor_category:       data.armor_category as string | undefined,
    armor_class:          data.armor_class as Item['armor_class'],
    str_minimum:          data.str_minimum as number | undefined,
    stealth_disadvantage: data.stealth_disadvantage as boolean | undefined,
    desc:                 descArr,
    desc_de:              undefined,
    cost:                 data.cost as Item['cost'],
    weight:               data.weight as number | undefined,
    source:               'SRD',
    url:                  data.url as string,
  };
}

// ── Monster (Mapping API → App-Schema, mit deutscher Konvertierung) ──────────

function crFromNumber(n: number): string {
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  return String(n);
}

/** "30" / "30 ft." → "9 m" (5 ft = 1,5 m, deutsches Komma). */
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

/** Wandelt eine rohe DnD-API-Monster-Ressource in unser `Monster`-Schema (mit deutscher Konvertierung). */
export function mapApiResourceToMonster(d: Record<string, unknown>): Monster {
  const profs = (d.proficiencies as ProfEntry[]) ?? [];
  const acArr = (d.armor_class as Array<{ value: number; type: string }> | undefined) ?? [];
  const acNote = acArr.length > 1
    ? acArr.slice(1).map((a) => a.type).join(', ')
    : (acArr[0]?.type !== 'dex' ? (acArr[0]?.type ?? '') : '');

  return {
    index: d.index as string,
    source: 'SRD',
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

// ── Zauber (Mapping API → App-Schema, mit deutscher Konvertierung) ───────────

function convertRange(r: string): string {
  return r
    .replace(/(\d+)-foot[-\s]/gi, (_, n) => `${ftToM(parseInt(n))}-`)
    .replace(/(\d+)\s*feet?/gi, (_, n) => ftToM(parseInt(n)))
    .replace(/\bTouch\b/gi, 'Berührung').replace(/\bSelf\b/gi, 'Selbst')
    .replace(/\bSight\b/gi, 'Sichtlinie').replace(/\bUnlimited\b/gi, 'Unbegrenzt')
    .replace(/\bSpecial\b/gi, 'Besonders').replace(/\bsphere\b/gi, 'Sphäre')
    .replace(/\bcone\b/gi, 'Kegel').replace(/\bcube\b/gi, 'Würfel')
    .replace(/\bline\b/gi, 'Linie').replace(/\bcylinder\b/gi, 'Zylinder')
    .replace(/\bradius\b/gi, 'Radius');
}

function convertDuration(d: string): string {
  return d
    .replace(/\bConcentration,\s*up to\s*/gi, 'Konzentration, bis zu ')
    .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*hours?/gi, (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*days?/gi, (_, n) => `${n} Tag${n === '1' ? '' : 'e'}`)
    .replace(/(\d+)\s*rounds?/gi, (_, n) => `${n} Runde${n === '1' ? '' : 'n'}`)
    .replace(/\bInstantaneous\b/gi, 'Unmittelbar').replace(/\bUntil dispelled\b/gi, 'Bis aufgelöst')
    .replace(/\bPermanent\b/gi, 'Dauerhaft').replace(/\bSpecial\b/gi, 'Besonders');
}

function convertCastingTime(ct: string): string {
  return ct
    .replace(/\b1 action\b/gi, '1 Aktion').replace(/\b1 bonus action\b/gi, '1 Bonusaktion')
    .replace(/\b1 reaction\b/gi, '1 Reaktion')
    .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*hours?/gi, (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
    .replace(/\bwhich you take when\b/gi, 'die du nimmst, wenn');
}

/** Wandelt eine rohe DnD-API-Zauber-Ressource in unser `Spell`-Schema (mit deutscher Konvertierung). */
export function mapApiResourceToSpell(data: Record<string, unknown>): Spell {
  const comps = (data.components as string[]) ?? [];
  const school = (data.school as Record<string, unknown>)?.index as string;
  const damage = data.damage as {
    damage_type: { index: string; name: string };
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  } | undefined;
  const dc = data.dc as Record<string, unknown> | undefined;
  return {
    index: data.index as string,
    name: data.name as string,
    level: Number(data.level ?? 0),
    school: (school in SPELL_SCHOOLS ? school : 'evocation') as Spell['school'],
    casting_time: convertCastingTime(String(data.casting_time ?? '')),
    range: convertRange(String(data.range ?? '')),
    components: {
      verbal: comps.includes('V'),
      somatic: comps.includes('S'),
      material: comps.includes('M'),
      materials_needed: (data.material as string) ?? null,
    },
    duration: convertDuration(String(data.duration ?? '')),
    concentration: Boolean(data.concentration),
    ritual: Boolean(data.ritual),
    classes: ((data.classes as Array<{ index: string }>) ?? []).map((c) => c.index),
    desc: (data.desc as string[]) ?? [],
    desc_de: [],
    higher_level: (data.higher_level as string[])?.length ? (data.higher_level as string[]) : null,
    higher_level_de: [],
    damage: damage
      ? {
          damage_type: { index: damage.damage_type.index, name: damage.damage_type.name },
          damage_at_slot_level: damage.damage_at_slot_level,
          damage_at_character_level: damage.damage_at_character_level,
        }
      : undefined,
    dc: dc
      ? { dc_type: dc.dc_type as { index: string; name: string }, dc_success: String(dc.dc_success ?? '') }
      : undefined,
    area_of_effect: data.area_of_effect as Spell['area_of_effect'],
    source: 'SRD',
  };
}

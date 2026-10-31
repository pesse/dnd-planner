/** Character-Service-JSON → `DdbSheet`. Rein, ohne Bibliothek. */
import { ddbSheetSchema, type DdbFeature, type DdbItemDetail, type DdbOrigin, type DdbSheet } from '$lib/schemas/ddbSheet';
import type { DdbChoice, DdbCharacterJson, DdbModifier } from '$lib/schemas/ddbCharacterJson';
import { SKILL_NAMES } from '$lib/schemas/vocabulary';
import { ABILITY_NAMES } from '$lib/schemas/abilities';
import { sign } from '$lib/utils/num';
import { htmlText } from './htmlText';
import {
  abilityScores, activeModifiers, armorClass, initiative, maxHitPoints, ofType, passiveBonus,
  proficiencyBonus, savingThrowProfs, skills, slug, totalLevel, walkSpeedFt,
} from './jsonDerived';

const WEAPON_ENTITY = 1782728300;
const SIZES: Record<number, string> = { 2: 'Tiny', 3: 'Small', 4: 'Medium', 5: 'Large', 6: 'Huge', 7: 'Gargantuan' };
const ALIGNMENTS: Record<number, string> = {
  1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good', 4: 'Lawful Neutral', 5: 'Neutral',
  6: 'Chaotic Neutral', 7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
};
const ARMOR_SUBTYPES = new Set(['light-armor', 'medium-armor', 'heavy-armor', 'shields']);
const STEALTH_DISADVANTAGE = 2;
const RANGED_ATTACK = 2;

/** Übungen, die nicht als eigene Liste auf den Bogen kommen: Fertigkeiten, Rettungswürfe, Platzhalter. */
const NOT_A_LIST = new Set([
  ...SKILL_NAMES.map(slug),
  ...ABILITY_NAMES.map((a) => `${slug(a)}-saving-throws`),
  'ability-checks', 'initiative', 'saving-throws',
]);

const joined = (...parts: (string | null | undefined)[]): string =>
  parts.map((p) => (p ?? '').trim()).filter(Boolean).join('\n\n');

const unique = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];

interface DefinitionMeta {
  description?: string | null;
  snippet?: string | null;
  isHomebrew?: boolean | null;
  sourceId?: number | null;
  sources?: { sourceId?: number | null }[];
}

function originOf(def: DefinitionMeta | null | undefined): DdbOrigin {
  return {
    sourceId: def?.sources?.[0]?.sourceId ?? def?.sourceId ?? null,
    homebrew: def?.isHomebrew === true,
    desc: htmlText(def?.description || def?.snippet),
  };
}

function proficiencyLists(mods: DdbModifier[]): Pick<DdbSheet, 'armor' | 'weapons' | 'tools' | 'languages'> {
  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  for (const m of ofType(mods, 'proficiency')) {
    if (NOT_A_LIST.has(m.subType) || m.subType.startsWith('choose-')) continue;
    const name = m.friendlySubtypeName ?? m.subType;
    if (ARMOR_SUBTYPES.has(m.subType)) armor.push(name);
    else if (m.subType.endsWith('-weapons') || m.entityTypeId === WEAPON_ENTITY) weapons.push(name);
    else tools.push(name);
  }
  const languages = ofType(mods, 'language').filter((m) => !m.subType.startsWith('choose-')).map((m) => m.friendlySubtypeName ?? m.subType);
  return { armor: unique(armor), weapons: unique(weapons), tools: unique(tools), languages: unique(languages) };
}

/** Getroffene Wahlen je Merkmal (`componentId`), mit Beschriftung aus der Wahl oder ihrer Liste. */
function choiceLabels(d: DdbCharacterJson): Map<number, string[]> {
  const c = d.choices;
  const out = new Map<number, string[]>();
  if (!c) return out;
  const defs = new Map(c.choiceDefinitions.map((def) => [def.id, def.options]));
  const label = (ch: DdbChoice): string | undefined =>
    (ch.options.length ? ch.options : defs.get(`${ch.componentTypeId}-${ch.type}`) ?? [])
      .find((o) => o.id === ch.optionValue)?.label;
  for (const ch of [...c.race, ...c.class, ...c.background, ...c.feat]) {
    const l = ch.optionValue != null && ch.componentId != null ? label(ch) : undefined;
    if (l) out.set(ch.componentId!, [...(out.get(ch.componentId!) ?? []), l]);
  }
  return out;
}

function features(d: DdbCharacterJson): DdbFeature[] {
  const picks = choiceLabels(d);
  const of = (section: string, def: { id?: number | null; name: string }, origin: DdbOrigin | null = null): DdbFeature =>
    ({ section, name: def.name, options: def.id != null ? picks.get(def.id) ?? [] : [], origin });
  const race = d.race?.fullName ?? '';
  return [
    ...d.classes.flatMap((k) => k.classFeatures
      .filter((f) => (f.definition.requiredLevel ?? 1) <= k.level)
      .map((f) => of(`${k.definition.name.toUpperCase()} FEATURES`, f.definition))),
    ...(d.race?.racialTraits ?? []).map((t) => of(`${race.toUpperCase()} SPECIES TRAITS`, t.definition)),
    ...d.feats.map((f) => of('FEATS', f.definition, originOf(f.definition))),
  ];
}

function spells(d: DdbCharacterJson): DdbSheet['spells'] {
  const className = new Map(d.classes.map((k) => [k.id, k.definition.name]));
  const featName = new Map(d.feats.map((f) => [f.definition.id, f.definition.name]));
  const itemName = new Map(d.inventory.map((i) => [i.definition.id, i.definition.name]));
  const out: DdbSheet['spells'] = [];
  const push = (list: typeof d.classSpells[number]['spells'], source: (componentId: number | null | undefined) => string) => {
    for (const sp of list) {
      if (sp.definition) out.push({ name: sp.definition.name, level: sp.definition.level ?? 0, source: source(sp.componentId), origin: originOf(sp.definition) });
    }
  };
  for (const cs of d.classSpells) push(cs.spells, () => className.get(cs.characterClassId) ?? '');
  const s = d.spells;
  if (s) {
    push(s.class, () => d.classes[0]?.definition.name ?? '');
    push(s.race, () => d.race?.fullName ?? '');
    push(s.feat, (id) => featName.get(id) ?? 'Feat');
    push(s.background, () => 'Background');
    push(s.item, (id) => itemName.get(id) ?? 'Item');
  }
  return out;
}

type ItemDefinition = DdbCharacterJson['inventory'][number]['definition'];

function itemDetail(def: ItemDefinition): DdbItemDetail {
  const bundle = Math.max(def.bundleSize ?? 1, 1);
  return {
    type: def.type ?? '',
    filterType: def.filterType ?? '',
    rarity: def.rarity ?? '',
    magic: def.magic === true,
    costGp: def.cost ?? null,
    weightLb: def.weight == null ? null : def.weight / bundle,
    armorClass: def.armorClass ?? null,
    armorTypeId: def.armorTypeId ?? null,
    stealthDisadvantage: def.stealthCheck === STEALTH_DISADVANTAGE,
    strengthRequirement: def.strengthRequirement ?? null,
    damage: def.damage?.diceString ?? '',
    damageType: def.damageType ?? '',
    weaponCategoryId: def.categoryId ?? null,
    ranged: def.attackType === RANGED_ATTACK,
    properties: def.properties.map((p) => p.name),
    attunement: def.canAttune ? (def.attunementDescription || 'yes') : '',
  };
}

function inventory(d: DdbCharacterJson): DdbSheet['inventory'] {
  const lb = (each: number | null | undefined, qty: number, bundle = 1) =>
    each == null ? null : (each * qty) / Math.max(bundle, 1);
  return [
    ...d.inventory.map((i) => {
      const qty = i.quantity ?? 1;
      return {
        name: i.definition.name, qty, totalWeightLb: lb(i.definition.weight, qty, i.definition.bundleSize ?? 1),
        equipped: i.equipped ?? false, origin: originOf(i.definition), detail: itemDetail(i.definition),
      };
    }),
    ...d.customItems.map((i) => ({
      name: i.name, qty: i.quantity ?? 1, totalWeightLb: lb(i.weight, i.quantity ?? 1), equipped: false,
      origin: { sourceId: null, homebrew: true, desc: htmlText(i.description) }, detail: null,
    })),
  ];
}

const s = (v: string | number | null | undefined): string => (v == null ? '' : String(v));

function classes(d: DdbCharacterJson): DdbSheet['classes'] {
  return d.classes.map((k) => ({
    name: k.definition.name,
    level: k.level,
    origin: originOf(k.definition),
    subclass: k.subclassDefinition ? { name: k.subclassDefinition.name, origin: originOf(k.subclassDefinition) } : null,
  }));
}

export function parseDdbJson(d: DdbCharacterJson): DdbSheet {
  const mods = activeModifiers(d);
  const scores = abilityScores(d, mods);
  const pb = proficiencyBonus(totalLevel(d));
  const skillRows = skills(mods, scores, pb);
  const perception = skillRows.find((r) => r.name === 'Perception')?.value ?? 0;
  const cur = d.currencies;
  const notes = d.notes;
  const bg = d.background?.definition;
  return ddbSheetSchema.parse({
    id: String(d.id),
    name: d.name,
    playerName: s(d.username),
    classes: classes(d),
    species: { name: d.race?.fullName ?? '', origin: d.race ? originOf(d.race) : null },
    background: { name: bg?.name ?? d.background?.customBackground?.name ?? '', origin: bg ? originOf(bg) : null },
    xp: d.currentXp ? String(d.currentXp) : '',
    abilities: scores,
    saveProfs: savingThrowProfs(mods),
    skills: skillRows,
    ac: String(armorClass(d, mods, scores)),
    initiative: sign(initiative(mods, scores)),
    speedFt: walkSpeedFt(d, mods),
    hpMax: String(maxHitPoints(d, mods, scores)),
    hitDice: d.classes.filter((k) => k.definition.hitDice).map((k) => `${k.level}d${k.definition.hitDice}`).join(' + '),
    proficiencyBonus: pb,
    heroicInspiration: d.inspiration === true,
    passivePerception: String(10 + perception + passiveBonus(mods)),
    ...proficiencyLists(mods),
    features: features(d),
    inventory: inventory(d),
    currency: { cp: s(cur?.cp), sp: s(cur?.sp), ep: s(cur?.ep), gp: s(cur?.gp), pp: s(cur?.pp) },
    personal: {
      gender: s(d.gender), age: s(d.age), size: SIZES[d.race?.sizeId ?? 0] ?? '', height: s(d.height),
      weight: d.weight ? `${d.weight} lb` : '', alignment: ALIGNMENTS[d.alignmentId ?? 0] ?? '', faith: s(d.faith),
      skin: s(d.skin), eyes: s(d.eyes), hair: s(d.hair),
    },
    traits: joined(d.traits?.personalityTraits),
    ideals: joined(d.traits?.ideals),
    bonds: joined(d.traits?.bonds),
    flaws: joined(d.traits?.flaws),
    allies: joined(notes?.allies, notes?.organizations),
    backstory: joined(notes?.backstory),
    notes: joined(
      notes?.otherNotes,
      notes?.enemies && `### Feinde\n\n${notes.enemies}`,
      notes?.personalPossessions && `### Besitz\n\n${notes.personalPossessions}`,
      notes?.otherHoldings && `### Weitere Besitztümer\n\n${notes.otherHoldings}`,
      d.traits?.appearance && `### Aussehen\n\n${d.traits.appearance}`,
    ),
    spells: spells(d),
    spellcastingClasses: d.classes.filter((k) => k.definition.canCastSpells).map((k) => k.definition.name),
  });
}

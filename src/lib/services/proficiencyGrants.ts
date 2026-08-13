/**
 * Summiert die Übungen aus den VERLINKTEN Bibliotheks-Artefakten — eine Funktion statt
 * vier, weil alle dieselbe `proficiencyGrant`-Form tragen. Die Werte bleiben englisch,
 * übersetzt wird erst beim Anwenden auf den Bogen. Am Charakter entsteht KEINE Provenienz:
 * die Häkchen sind die Wahrheit, hier entsteht nur das Angebot, gegen das die UI
 * vergleicht — deshalb ist die Ableitung idempotent und braucht keine Rücknahme.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import type { ArmorTraining, SkillName, WeaponCategory } from '$lib/schemas/vocabulary';
import type { ProficiencyGrant, SkillGrant } from '$lib/schemas/grants';
import { isEmptyProficiencyGrant } from '$lib/schemas/grants';
import { SKILL_DEFS, skillLabelDe } from '$lib/domain/skills';
import { normName } from '$lib/utils/text';
import type { ProficiencyFlags } from '$lib/schemas/characterSchema';
import type { Change } from '$lib/schemas/levelUp';
import { type AbilityKey } from '$lib/schemas/abilities';
import { getProgressionByKey } from './classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, featDisplayName, type FeatEntry } from '$lib/featsLibrary';

import { abilityKeyOf, ABILITY_LABEL } from '$lib/schemas/abilities';

import { PROFICIENCY_FLAGS, WEAPON_LABEL_DE, ARMOR_LABEL_DE } from '$lib/domain/proficiencies';
export { WEAPON_LABEL_DE, ARMOR_LABEL_DE };
export { skillLabelDe };

export const abilityLabelDe = (en: string): string => {
  const key = abilityKeyOf(en);
  return key ? ABILITY_LABEL[key] : en;
};
export const isEmptyGrant = isEmptyProficiencyGrant;

/** Kurzform fürs Panel: „2 aus 6", „Athletik, Einschüchtern". */
export function skillGrantSummary(g: SkillGrant | undefined): string {
  if (!g) return '';
  const parts: string[] = [];
  if (g.fixed.length) parts.push(g.fixed.map(skillLabelDe).join(', '));
  if (g.choose > 0) parts.push(g.from.length ? `${g.choose} aus ${g.from.length}` : `${g.choose} frei wählbar`);
  return parts.join(' · ');
}

export interface GrantSource {
  /** Deutsch, mit Herkunft davor: „Schurke", „Elf: Scharfe Sinne", „Talent: Geübt". */
  label: string;
  sourceKey: string;
}

export interface SourcedGrant<T> {
  value: T;
  source: GrantSource;
}

/** N aus `from` — eine leere `from`-Liste heißt „beliebige Fertigkeit". */
export interface OpenChoice {
  source: GrantSource;
  choose: number;
  from: SkillName[];
}

export interface CollectedGrants {
  skills: SourcedGrant<SkillName>[];
  /** Offene Wahlen, eine je Quelle. */
  choices: OpenChoice[];
  savingThrows: SourcedGrant<AbilityName>[];
  weapons: SourcedGrant<WeaponCategory>[];
  weaponsOther: SourcedGrant<string>[];
  armor: SourcedGrant<ArmorTraining>[];
}

/**
 * Ausschließlich die LINKS: ein `Character` erfüllt das strukturell, und der Editor kann
 * stattdessen seinen lokalen Zustand übergeben, ohne den ganzen Charakter zu binden.
 */
export interface GrantInput {
  classes?: { sourceKey: string; name?: string; subclassKey?: string }[];
  species?: { sourceKey?: string; subspeciesKey?: string };
  backgroundRef?: { sourceKey?: string };
  features?: { sourceKey?: string; name?: string }[];
}

const emptyCollected = (): CollectedGrants => ({
  skills: [], choices: [], savingThrows: [], weapons: [], weaponsOther: [], armor: [],
});

function addSkillGrant(out: CollectedGrants, grant: SkillGrant | undefined, source: GrantSource): void {
  if (!grant) return;
  for (const value of grant.fixed) out.skills.push({ value, source });
  if (grant.choose > 0) out.choices.push({ source, choose: grant.choose, from: grant.from });
}

function addGrant(out: CollectedGrants, grant: ProficiencyGrant | undefined, source: GrantSource): void {
  if (!grant) return;
  addSkillGrant(out, grant.skills, source);
  for (const value of grant.savingThrows) out.savingThrows.push({ value, source });
  for (const value of grant.weapons) out.weapons.push({ value, source });
  for (const value of grant.weaponsOther) out.weaponsOther.push({ value, source });
  for (const value of grant.armor) out.armor.push({ value, source });
}

/**
 * Vokabular → Bogen-Flag über `PROFICIENCY_FLAGS`, die EINE Abbildung für Wizard und
 * Aufstieg. Eine zweite liefe auseinander — daran ist die Fertigkeits-Zuweisung schon
 * einmal still gescheitert.
 */
export function markProficiency(flags: ProficiencyFlags, kind: 'weapons', value: WeaponCategory): void;
export function markProficiency(flags: ProficiencyFlags, kind: 'armor', value: ArmorTraining): void;
export function markProficiency(
  flags: ProficiencyFlags,
  kind: 'weapons' | 'armor',
  value: WeaponCategory | ArmorTraining,
): void {
  const hit = PROFICIENCY_FLAGS.find((f) => f.def.kind === kind && f.def.value === value);
  if (hit) flags[hit.field] = true;
}

export function markSavingThrow(flags: Record<AbilityKey, boolean>, ability: AbilityName): void {
  const key = abilityKeyOf(ability);
  if (key) flags[key] = true;
}

/**
 * Je ein Emitter für die vier Routen, die in `proficiencyGrantChanges` UND `riderGrantChanges`
 * (levelUp/changes.ts) zeilengleich wären — Label-Formel inklusive, hier EINMAL.
 */
export const skillProficiencyChange = (skill: SkillName, meta: { step: string; source: string }): Change =>
  ({ target: 'proficiency', skill, ...meta, label: `Übung: ${skillLabelDe(skill)}` });

export const weaponProficiencyChange = (value: WeaponCategory, meta: { step: string; source: string }): Change =>
  ({ target: 'weaponProficiency', value, ...meta, label: `Übung: ${WEAPON_LABEL_DE[value]}` });

export const armorTrainingChange = (value: ArmorTraining, meta: { step: string; source: string }): Change =>
  ({ target: 'armorTraining', value, ...meta, label: `Vertrautheit: ${ARMOR_LABEL_DE[value]}` });

export const savingThrowChange = (value: AbilityName, meta: { step: string; source: string }): Change =>
  ({ target: 'savingThrow', value, ...meta, label: `Rettungswurf: ${abilityLabelDe(value)}` });

/**
 * Die Vault-Übungsform als `Change[]`, die Sprache beider Flows. Die Tabelle ist über
 * `keyof ProficiencyGrant` total: ein neues Feld am Vault-Grant bricht den Build, statt
 * still ohne Senke zu bleiben — genau das ist `weaponsOther` zweimal passiert.
 * `skills.choose` erzeugt bewusst nichts: eine offene Wahl wird gefragt, nicht gewährt.
 */
export function proficiencyGrantChanges(
  g: ProficiencyGrant,
  meta: { step: string; source: string },
  /**
   * Was den Charakter schon anders erreicht (im Aufstieg alles außer `weaponsOther` über
   * den Rider). Bewusst eine Ausschluss-, keine Einschlussliste: ein neues Feld am
   * Vault-Grant landet so per Default IM Dokument, statt still zu fehlen.
   */
  skip: readonly (keyof ProficiencyGrant)[] = [],
): Change[] {
  const out: Change[] = [];
  const routes: { [K in keyof ProficiencyGrant]: () => void } = {
    skills: () => {
      for (const skill of g.skills.fixed) out.push(skillProficiencyChange(skill, meta));
    },
    savingThrows: () => {
      for (const value of g.savingThrows) out.push(savingThrowChange(value, meta));
    },
    weapons: () => {
      for (const value of g.weapons) out.push(weaponProficiencyChange(value, meta));
    },
    weaponsOther: () => {
      for (const value of g.weaponsOther)
        out.push({ target: 'weaponProficiencyOther', value, ...meta, label: `Übung: ${value}` });
    },
    armor: () => {
      for (const value of g.armor) out.push(armorTrainingChange(value, meta));
    },
  };
  for (const [key, run] of Object.entries(routes) as [keyof ProficiencyGrant, () => void][])
    if (!skip.includes(key)) run();
  return out;
}

function findFeat(lib: FeatEntry[], key: string | undefined, name: string): FeatEntry | undefined {
  const k = key?.trim();
  const n = normName(name);
  return lib.find(
    (f) =>
      (k && f.sourceKey === k) ||
      (n && (featDisplayName(f).toLowerCase() === n || f.name.toLowerCase() === n)),
  );
}

/** Das Herkunftstalent hängt am Hintergrund und steht nicht in `features`. */
async function addBackgroundGrants(out: CollectedGrants, key: string, featLib: FeatEntry[]): Promise<void> {
  const bg = await getBackgroundByKey(key);
  if (!bg) return;
  addGrant(out, bg.proficiencyGrant, { label: bg.nameDe || bg.name || key, sourceKey: key });
  if (!bg.featKey) return;
  const originFeat = findFeat(featLib, bg.featKey, '');
  if (originFeat)
    addGrant(out, originFeat.grants?.proficiencies, {
      label: `Herkunftstalent: ${featDisplayName(originFeat)}`,
      sourceKey: bg.featKey,
    });
}

/**
 * Die Reihenfolge in `classes[]` ist maßgeblich: `classes[0]` ist die STARTKLASSE mit der
 * vollen Kerntabelle, jede weitere kam per Klassenkombination dazu und gewährt nur
 * `skillGrantMulticlass`.
 */
async function addClassGrants(out: CollectedGrants, classes: NonNullable<GrantInput['classes']>): Promise<void> {
  for (const [i, cls] of classes.entries()) {
    if (!cls.sourceKey) continue;
    const prog = await getProgressionByKey(cls.sourceKey);
    if (!prog) continue;
    const source: GrantSource = { label: cls.name?.trim() || prog.nameDe || prog.name, sourceKey: cls.sourceKey };
    if (i === 0) addGrant(out, prog.proficiencyGrant, source);
    else addSkillGrant(out, prog.skillGrantMulticlass, source);
  }
}

/**
 * Am einzelnen MERKMAL ist `grants.proficiencies` die einzige Übungs-Senke; das
 * `proficiencyGrant` daneben gilt nur für Klassenkopf und Hintergrund, die keine
 * Merkmale sind.
 */
async function addSpeciesGrants(out: CollectedGrants, keys: (string | undefined)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    const spec = await getSpeciesByKey(key);
    if (!spec) continue;
    const specName = spec.nameDe || spec.name || key;
    for (const trait of spec.traits)
      addGrant(out, trait.grants?.proficiencies, {
        label: `${specName}: ${trait.nameDe || trait.name}`,
        sourceKey: trait.key || key,
      });
  }
}

/**
 * Wahl-Annotationen liegen in derselben Liste; sie tragen einen Merkmals-Key, den das
 * Talent-Wörterbuch nicht kennt, und fallen deshalb ohne Sonderfall heraus.
 */
function addFeatGrants(out: CollectedGrants, refs: NonNullable<GrantInput['features']>, featLib: FeatEntry[]): void {
  for (const ref of refs) {
    const entry = findFeat(featLib, ref.sourceKey, ref.name ?? '');
    if (!entry) continue;
    addGrant(out, entry.grants?.proficiencies, {
      label: `Talent: ${featDisplayName(entry)}`,
      sourceKey: entry.sourceKey ?? '',
    });
  }
}

/** Fehlt ein Link lokal, fällt seine Quelle aus — das Panel zeigt nichts, statt zu raten. */
export async function collectGrants(c: GrantInput): Promise<CollectedGrants> {
  const out = emptyCollected();
  const featLib = await getFeats();

  const bgKey = c.backgroundRef?.sourceKey ?? '';
  if (bgKey) await addBackgroundGrants(out, bgKey, featLib);
  await addClassGrants(out, c.classes ?? []);
  await addSpeciesGrants(out, [c.species?.sourceKey, c.species?.subspeciesKey]);
  addFeatGrants(out, c.features ?? [], featLib);

  return out;
}

export function choiceAllows(choice: OpenChoice, skill: SkillName): boolean {
  return choice.from.length === 0 || choice.from.includes(skill);
}

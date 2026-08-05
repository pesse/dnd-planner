/**
 * Deklarierter Zauber-Zugang eines Merkmals — Liste, Attribut und Kontingent NEBEN dem
 * Klassen-Zauberwirken. Kein LLM: die Zahlen stehen in der Deklaration, die Namen in
 * `vault/spells`, und Deutsch kommt aus vorhandenen Tabellen statt aus einem Call.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import type { AbilityKey } from '$lib/schemas/classProgression';
import type { CastingGrant } from '$lib/schemas/casting';
import { resolveClass } from '$lib/spellLibrary';
import { ABILITY_FROM_EN, CLASS_NAME_DE_BY_SLUG } from './classProgression';
import { CASTER_ABILITY_DE, spellAttackBonus, spellSaveDC } from './spellcasting';
import { castingSourceOf } from './spellcasting/resolve';
import { quotaContext, quotaViews } from './spellcasting/quota';
import { declaredChoice } from './declaredChoice';
import type { AnalysisChoice } from './analysis/types';
import type { DeclaredChoiceSource } from './declaration/optionList';

export type SpellAccessSource = DeclaredChoiceSource & { grantsCasting?: CastingGrant };

export interface SpellAccessGrant {
  featureKey: string;
  /** Englisch und kanonisch. */
  feature: string;
  featureDe: string;
  /** Zulässige Zauberlisten als englische Klassen-Keys; Länge 1 = festgelegt. */
  lists: string[];
  /** Zulässige Zauberattribute; Länge 1 = festgelegt. */
  abilities: AbilityName[];
  picks: { level: number; count: number }[];
}

export function isSpellAccessFeature(f: SpellAccessSource): boolean {
  return f.grantsChoice?.kind === 'spellAccess';
}

/**
 * `spellAccess` hat heute genau einen Vault-Eintrag (Magic Initiate) — eine Talent-Quota ohne
 * Stufenbezug, deshalb ist `level` ohne echte Charakterstufe sicher: `perLevel` ist bei jeder
 * heutigen Deklaration 0, und `since` fällt auf 1 zurück. Ein künftiger stufenabhängiger
 * Zauber-Zugang bräuchte hier die echte Stufe statt der Vorgabe.
 */
const NO_SPELL_KEY = (): undefined => undefined;

/**
 * `specialisation` ist die Vorgabe der QUELLE des Merkmals („Magic Initiate (Wizard)").
 * Trifft sie keinen deklarierten Wert, bleibt die Liste vollständig — dann fragt der Flow,
 * statt eine falsche Liste festzuschreiben. Die Zahlen kommen aus `grantsCasting`, nicht mehr
 * aus `grantsChoice.kind='spellAccess'` — dessen Felder bleiben nur noch das Zugehörigkeits-Signal.
 */
export function spellAccessGrantOf(
  feature: SpellAccessSource,
  specialisation = '',
  level = 1,
): SpellAccessGrant | null {
  const grant = feature.grantsChoice;
  if (!grant || grant.kind !== 'spellAccess') return null;

  const source = castingSourceOf(
    { key: feature.key, name: feature.name, nameDe: feature.nameDe, grantsCasting: feature.grantsCasting },
    { origin: 'feat', level, classKey: '' },
  );
  if (!source) return null;

  const ctx = quotaContext(null, source.level, { standard: [], pact: [], casterLevel: 0 }, NO_SPELL_KEY);
  const views = quotaViews(source, ctx);

  const declared = [...new Set(views.flatMap((v) => v.pool.lists.map((l) => l.toLowerCase().trim())))];
  const fixed = specialisation.trim() ? resolveClass(specialisation) : null;
  const lists = fixed && declared.includes(fixed) ? [fixed] : declared;

  return {
    featureKey: feature.key ?? '',
    feature: feature.name,
    featureDe: feature.nameDe?.trim() || feature.name,
    lists,
    abilities: source.ability?.fixed ? [source.ability.fixed] : [...(source.ability?.choose ?? [])],
    picks: views.map((v) => ({ level: v.levels[0] ?? 0, count: v.count })),
  };
}

/**
 * Der KI-Eingang, EINE Regel für Wizard und Aufstieg: ein zweiter Filter liefe auseinander
 * und das Merkmal würde auf einem der beiden Wege doppelt gefragt.
 */
export function withoutSpellAccessFeatures<T extends { key?: string }>(
  features: T[],
  grants: SpellAccessGrant[],
): T[] {
  const owned = new Set(grants.map((g) => g.featureKey).filter(Boolean));
  return features.filter((f) => !owned.has(f.key ?? ''));
}

// Vom KI-Namensraum (`choice_<slug>_1`) unterscheidbar: diese Antworten gehen NICHT als
// <resolved_choices> ans Modell, das die id nur einem erfundenen Rider zuordnen könnte.
const slug = (grant: SpellAccessGrant): string =>
  (grant.featureKey || grant.feature).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const spellListChoiceId = (grant: SpellAccessGrant): string => `spellaccess_${slug(grant)}_list`;
export const spellAbilityChoiceId = (grant: SpellAccessGrant): string => `spellaccess_${slug(grant)}_ability`;
/**
 * Trägt die LISTE mit: sonst überlebte eine Auswahl den Listenwechsel — mit der neuen id
 * fällt sie beim Zusammenbauen heraus.
 */
export const spellPickChoiceId = (grant: SpellAccessGrant, level: number, list: string): string =>
  `spellaccess_${slug(grant)}_${list}_pick${level}`;

export function fixedList(grant: SpellAccessGrant): string {
  return grant.lists.length === 1 ? grant.lists[0] : '';
}

const emptyChoice = (grant: SpellAccessGrant, id: string): AnalysisChoice =>
  declaredChoice({ id, feature: grant.feature, featureDe: grant.featureDe, featureKey: grant.featureKey });

const gradeLabel = (level: number, count: number): string =>
  level === 0
    ? `${count} ${count === 1 ? 'Zaubertrick' : 'Zaubertricks'} wählen`
    : `${count} ${count === 1 ? 'Zauber' : 'Zauber'} des Grades ${level} wählen`;

/**
 * Reihenfolge ist Pflicht: Liste → Attribut → Zauber. Solange die Liste offen ist, entstehen
 * KEINE Zauber-Wahlen — ein Picker ohne Klassenfilter böte die ganze Bibliothek an.
 */
export function spellAccessChoices(grant: SpellAccessGrant, answeredList = ''): AnalysisChoice[] {
  const choices: AnalysisChoice[] = [];

  if (grant.lists.length > 1) {
    choices.push({
      ...emptyChoice(grant, spellListChoiceId(grant)),
      question: 'Which spell list?',
      questionDe: 'Zauberliste',
      options: [...grant.lists],
      optionsDe: grant.lists.map((l) => CLASS_NAME_DE_BY_SLUG[l] ?? l),
      help: 'Sets which list the spells of this feature come from.',
      helpDe: 'Bestimmt, aus welcher Liste die Zauber dieses Merkmals gewählt werden.',
    });
  }

  if (grant.abilities.length > 1) {
    choices.push({
      ...emptyChoice(grant, spellAbilityChoiceId(grant)),
      question: 'Which spellcasting ability?',
      questionDe: 'Zauberattribut',
      options: [...grant.abilities],
      optionsDe: grant.abilities.map((a) => CASTER_ABILITY_DE[ABILITY_FROM_EN[a.toLowerCase()]] ?? a),
      help: 'Sets attack bonus and save DC of this feature’s spells.',
      helpDe: 'Bestimmt Angriffsbonus und Rettungswurf-SG der Zauber dieses Merkmals.',
    });
  }

  const list = fixedList(grant) || (answeredList.trim() ? resolveClass(answeredList) ?? '' : '');
  if (list) {
    for (const pick of grant.picks) {
      choices.push({
        ...emptyChoice(grant, spellPickChoiceId(grant, pick.level, list)),
        type: 'spell-pick',
        question: gradeLabel(pick.level, pick.count),
        questionDe: gradeLabel(pick.level, pick.count),
        spellLevels: [pick.level],
        spellClass: list,
        max: pick.count,
        // Die Zauber stehen im Zauber-Block; ein Ledger-Eintrag wäre eine zweite Wahrheit.
        isBuildDecision: false,
      });
    }
  }

  return choices;
}

/**
 * Ein Ledger-Eintrag, soweit hier gebraucht. SG und Angriffsbonus entstehen daraus erst zur
 * ANZEIGEZEIT — der Übungsbonus steigt.
 */
export interface FeatureChoiceEntry {
  sourceKey?: string;
  choice: string;
}

/**
 * Nur deklarierte Werte zählen — ein Namensvergleich griffe die ASI-Wahl desselben Merkmals
 * („Charisma") mit.
 */
export function answeredAbility(grant: SpellAccessGrant, ledger: FeatureChoiceEntry[]): AbilityName | null {
  if (grant.abilities.length === 1) return grant.abilities[0];
  const allowed = new Map(grant.abilities.map((a) => [a.toLowerCase(), a]));
  for (const e of ledger) {
    if ((e.sourceKey ?? '') !== grant.featureKey) continue;
    const hit = allowed.get(e.choice.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export interface SpellAccessValues {
  featureKey: string;
  featureDe: string;
  abilityDe: string;
  saveDC: number;
  attackBonus: number;
}

export function spellAccessValues(
  grant: SpellAccessGrant,
  ledger: FeatureChoiceEntry[],
  mods: Record<AbilityKey, number>,
  profBonus: number,
): SpellAccessValues | null {
  const ability = answeredAbility(grant, ledger);
  const key = ability ? ABILITY_FROM_EN[ability.toLowerCase()] : undefined;
  if (!key) return null;

  const abilityMod = mods[key] ?? 0;
  return {
    featureKey: grant.featureKey,
    featureDe: grant.featureDe,
    abilityDe: CASTER_ABILITY_DE[key],
    saveDC: spellSaveDC(profBonus, abilityMod),
    attackBonus: spellAttackBonus(profBonus, abilityMod),
  };
}

/**
 * Bogen-Notiz **ohne Zahl**: SG und Angriffsbonus hängen am Übungsbonus und wären ab Stufe 5
 * falsch, denn der Freitext wird nicht nachgerechnet. Die Zahlen stehen auf der Karte.
 */
export function spellAccessNoteLines(
  grants: SpellAccessGrant[],
  answers: Record<string, string | string[]>,
): string[] {
  const answered = (id: string): string => {
    const a = answers[id];
    return (Array.isArray(a) ? a[0] : a)?.trim() ?? '';
  };

  const lines: string[] = [];
  for (const grant of grants) {
    const fixedAbility = grant.abilities.length === 1 ? grant.abilities[0] : '';
    const ability = fixedAbility || answered(spellAbilityChoiceId(grant));
    const abilityKey = ability ? ABILITY_FROM_EN[ability.toLowerCase()] : undefined;
    if (!abilityKey) continue;

    const list = fixedList(grant) || answered(spellListChoiceId(grant));
    const listDe = list ? (CLASS_NAME_DE_BY_SLUG[resolveClass(list) ?? list] ?? '') : '';
    const source = listDe ? `${listDe}-Liste, ` : '';
    lines.push(`${grant.featureDe}: ${source}Zauber über ${CASTER_ABILITY_DE[abilityKey]}`);
  }
  return lines;
}

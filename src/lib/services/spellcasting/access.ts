/**
 * Deklarierter Zauber-Zugang eines Merkmals — Liste, Attribut und Kontingent NEBEN dem
 * Klassen-Zauberwirken. Kein LLM: die Zahlen stehen in der Deklaration, die Namen in
 * `vault/spells`, und Deutsch kommt aus vorhandenen Tabellen statt aus einem Call.
 */
import { ABILITY_LABEL, ABILITY_LABEL_BY_NAME, abilityKeyOf, type AbilityKey, type AbilityName } from '$lib/schemas/abilities';
import type { CastingGrant } from '$lib/schemas/casting';
import { resolveClass } from '$lib/spellLibrary';
import { CLASS_NAME_DE_BY_SLUG } from '../classProgression';
import { castingSourceOf } from './resolve';
import { quotaContext, quotaViews } from './quota';
import { spellAttackBonus, spellSaveDC } from './state';
import { ledgerAnswers, pickAnswer, type LedgerAnswerEntry } from '../declaration/ledgerAnswers';
import { declaredChoice } from '../declaredChoice';
import type { AnalysisChoice } from '../analysis/types';
import type { DeclaredChoiceSource } from '../declaration/optionList';

export type SpellAccessSource = DeclaredChoiceSource & { grantsCasting?: CastingGrant };

export interface SpellAccessGrant {
  featureKey: string;
  /** Englisch und kanonisch. */
  feature: string;
  featureDe: string;
  /** Vergabe-Stufe der Instanz — mit `featureKey` der Anker der Antwort im Merkmals-Ledger. */
  gainedAt: number;
  /** Quellen-Id der Instanz (`spellcasting/resolve.ts::castingSourceId`). */
  sourceId: string;
  /** Zulässige Zauberlisten als englische Klassen-Keys; Länge 1 = festgelegt. */
  lists: string[];
  /** Die Liste steht nicht durch die Deklaration fest, sondern durch die Quelle des Merkmals. */
  listFromSource: boolean;
  /** Zulässige Zauberattribute; Länge 1 = festgelegt. */
  abilities: AbilityName[];
  picks: { level: number; count: number; sourceId: string; quotaId: string }[];
}

/** Woran die Instanz hängt; alles hat eine Vorgabe für den häufigen Fall „einmal, Stufe 1". */
export interface SpellAccessPlacement {
  /** Vorgabe der QUELLE des Merkmals („Magic Initiate (Wizard)"), englischer Klassenname. */
  specialisation?: string;
  /** Charakterstufe — maßgeblich für stufenabhängige Kontingente. */
  level?: number;
  gainedAt?: number;
  /** Vorgabe ist der Merkmals-Key, also die früheste Vergabe. */
  sourceId?: string;
}

/**
 * `spellAccess` hat heute genau einen Vault-Eintrag (Magic Initiate) — eine Talent-Quota ohne
 * Stufenbezug, deshalb ist `level` ohne echte Charakterstufe sicher: `perLevel` ist bei jeder
 * heutigen Deklaration 0, und `since` fällt auf 1 zurück. Ein künftiger stufenabhängiger
 * Zauber-Zugang bräuchte hier die echte Stufe statt der Vorgabe.
 */
const NO_SPELL_KEY = (): undefined => undefined;

/**
 * Die FRAGE, nicht die Antwort: bewusst ohne Ledger, damit eine getroffene Wahl noch alle
 * Optionen zeigt und änderbar bleibt. Nur die Vorgabe der Quelle verengt hier — sie ist eine
 * Regel, keine Entscheidung. Trifft sie keinen deklarierten Wert, bleibt die Liste vollständig,
 * statt eine falsche festzuschreiben.
 *
 * Maßgeblich ist `grantsCasting`: die Elfenabstammung deklariert eine Zweigwahl und stellt
 * trotzdem dieselbe Attributfrage („choose the ability when you select the lineage"). Wer nur
 * den Talent-Zugang meint, filtert vorher mit `isSpellAccessFeature` — der Fragebogen beider
 * Flows tut das, damit ein Klassenmerkmal nicht plötzlich in seinem Eingang steht.
 */
export function spellAccessGrantOf(
  feature: SpellAccessSource,
  place: SpellAccessPlacement = {},
): SpellAccessGrant | null {
  if (!feature.grantsCasting) return null;

  const featureKey = feature.key ?? '';
  const sourceId = place.sourceId || featureKey;
  const source = castingSourceOf(
    { key: featureKey, name: feature.name, nameDe: feature.nameDe, grantsCasting: feature.grantsCasting },
    { origin: 'feat', level: place.level ?? 1, classKey: '' },
    undefined,
    sourceId,
  );
  if (!source) return null;

  const ctx = quotaContext(null, source.level, { standard: [], pact: [], casterLevel: 0 }, NO_SPELL_KEY);
  const views = quotaViews(source, ctx);

  const declared = [...new Set(views.flatMap((v) => v.pool.lists.map((l) => l.toLowerCase().trim())))];
  const fixed = place.specialisation?.trim() ? resolveClass(place.specialisation) : null;
  const narrowed = !!fixed && declared.includes(fixed) && declared.length > 1;
  const lists = fixed && declared.includes(fixed) ? [fixed] : declared;

  return {
    featureKey,
    feature: feature.name,
    featureDe: feature.nameDe?.trim() || feature.name,
    gainedAt: place.gainedAt ?? 1,
    sourceId,
    lists,
    listFromSource: narrowed,
    abilities: source.ability?.fixed ? [source.ability.fixed] : [...(source.ability?.choose ?? [])],
    // Ein FESTES Kontingent (Elfenabstammung: „you know the Prestidigitation cantrip") ist eine
    // Gewährung, keine Wahl — ein Picker darüber böte an, was schon dasteht.
    picks: views
      .filter((v) => !v.fixed)
      .map((v) => ({ level: v.levels[0] ?? 0, count: v.count, sourceId: v.sourceId, quotaId: v.quotaId })),
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
// Über die Quellen-Id, damit ein zweimal genommenes Talent zwei Fragen stellt.
const slug = (grant: SpellAccessGrant): string =>
  (grant.sourceId || grant.featureKey || grant.feature).toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
 * Die zwei Wahlen, die zum MERKMAL gehören — laut Regeltext beide „when you select this feat".
 * Deshalb stellt sie außer dem Fragebogen auch die Merkmalsleiste nachträglich
 * (`services/characterChoices.ts`), aus DIESEN Funktionen: eine zweite Formulierung derselben
 * Frage liefe auseinander, und die Antwort landet in beiden Fällen im Merkmals-Ledger.
 */
export const SPELL_ACCESS_PARTS = ['list', 'ability'] as const;
export type SpellAccessPart = (typeof SPELL_ACCESS_PARTS)[number];

/** Die id der Frage — zugleich `choiceId` ihrer Antwort im Merkmals-Ledger. */
export const spellAccessPartId = (grant: SpellAccessGrant, part: SpellAccessPart): string =>
  part === 'list' ? spellListChoiceId(grant) : spellAbilityChoiceId(grant);

/** Die zulässigen Werte eines Teils — auch die Zuordnungsregel des Ledgers fragt hier. */
export function spellAccessOptions(grant: SpellAccessGrant, part: SpellAccessPart): readonly string[] {
  return part === 'list' ? grant.lists : grant.abilities;
}

/** Welche der beiden noch offen sind; leer = die Deklaration legt beides fest. */
export function spellAccessParts(grant: SpellAccessGrant): SpellAccessPart[] {
  return SPELL_ACCESS_PARTS.filter((part) => spellAccessOptions(grant, part).length > 1);
}

export function spellAccessPartChoice(grant: SpellAccessGrant, part: SpellAccessPart): AnalysisChoice {
  if (part === 'list')
    return {
      ...emptyChoice(grant, spellAccessPartId(grant, part)),
      question: 'Which spell list?',
      questionDe: 'Zauberliste',
      options: [...grant.lists],
      optionsDe: grant.lists.map((l) => CLASS_NAME_DE_BY_SLUG[l] ?? l),
      help: 'Sets which list the spells of this feature come from.',
      helpDe: 'Bestimmt, aus welcher Liste die Zauber dieses Merkmals gewählt werden.',
    };
  return {
    ...emptyChoice(grant, spellAccessPartId(grant, part)),
    question: 'Which spellcasting ability?',
    questionDe: 'Zauberattribut',
    options: [...grant.abilities],
    optionsDe: grant.abilities.map((a) => ABILITY_LABEL_BY_NAME[a] ?? a),
    help: 'Sets attack bonus and save DC of this feature’s spells.',
    helpDe: 'Bestimmt Angriffsbonus und Rettungswurf-SG der Zauber dieses Merkmals.',
  };
}

/** Ein Teil, den niemand mehr fragt — Anzeige am Merkmal, damit er nicht unsichtbar gilt. */
export interface SpellAccessFact {
  part: SpellAccessPart;
  labelDe: string;
  valueDe: string;
  /** Nicht die Deklaration hat entschieden, sondern der Hintergrund („Weiser" → Magier). */
  fromSource: boolean;
}

/**
 * Die Gegenseite von `spellAccessParts`, aus derselben Frage gebildet: die deutschen Labels
 * stehen in `spellAccessPartChoice`, und eine zweite Fassung davon liefe auseinander.
 */
export function spellAccessFacts(grant: SpellAccessGrant): SpellAccessFact[] {
  const open = new Set<SpellAccessPart>(spellAccessParts(grant));
  return SPELL_ACCESS_PARTS.filter((part) => !open.has(part)).flatMap((part) => {
    const choice = spellAccessPartChoice(grant, part);
    const valueDe = choice.optionsDe[0] ?? '';
    if (!valueDe) return [];
    return [{ part, labelDe: choice.questionDe, valueDe, fromSource: part === 'list' && grant.listFromSource }];
  });
}

/**
 * Reihenfolge ist Pflicht: Liste → Attribut → Zauber. Solange die Liste offen ist, entstehen
 * KEINE Zauber-Wahlen — ein Picker ohne Klassenfilter böte die ganze Bibliothek an.
 */
export function spellAccessChoices(grant: SpellAccessGrant, answeredList = ''): AnalysisChoice[] {
  const choices = spellAccessParts(grant).map((part) => spellAccessPartChoice(grant, part));

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
        sourceId: pick.sourceId,
        quotaId: pick.quotaId,
        max: pick.count,
        // Die Zauber stehen im Zauber-Block; ein Ledger-Eintrag wäre eine zweite Wahrheit.
        isBuildDecision: false,
      });
    }
  }

  return choices;
}

const answersOf = (grant: SpellAccessGrant, ledger: readonly LedgerAnswerEntry[]): string[] =>
  ledgerAnswers(ledger, grant.featureKey, grant.gainedAt);

/**
 * Nur deklarierte Werte zählen — ein Namensvergleich griffe die ASI-Wahl desselben Merkmals
 * („Charisma") mit. SG und Angriffsbonus entstehen daraus erst zur ANZEIGEZEIT, denn der
 * Übungsbonus steigt.
 */
export function answeredAbility(
  grant: SpellAccessGrant,
  ledger: readonly LedgerAnswerEntry[],
): AbilityName | null {
  if (grant.abilities.length === 1) return grant.abilities[0];
  return pickAnswer(answersOf(grant, ledger), grant.abilities);
}

/** Gegenstück zu `answeredAbility`; die Vorgabe der Quelle steckt schon in `grant.lists`. */
export function answeredList(grant: SpellAccessGrant, ledger: readonly LedgerAnswerEntry[]): string {
  return fixedList(grant) || (pickAnswer(answersOf(grant, ledger), grant.lists) ?? '');
}

/**
 * Zwei Instanzen desselben Talents trennt nur die Vergabe-Stufe — ohne sie stünden auf Karte
 * und Bogen zwei gleichlautende Zeilen. EINE Funktion für beide, denn `withSpellValues`
 * (`pdf/characterFields.ts`) findet die Notizzeile über genau dieses Präfix wieder.
 */
export const spellAccessLabel = (grant: SpellAccessGrant): string =>
  grant.sourceId === grant.featureKey ? grant.featureDe : `${grant.featureDe} (Stufe ${grant.gainedAt})`;

export interface SpellAccessValues {
  featureKey: string;
  /** Identität der Instanz — `featureKey` allein kollidiert beim zweimal genommenen Talent. */
  sourceId: string;
  featureDe: string;
  abilityDe: string;
  saveDC: number;
  attackBonus: number;
}

export function spellAccessValues(
  grant: SpellAccessGrant,
  ledger: readonly LedgerAnswerEntry[],
  mods: Record<AbilityKey, number>,
  profBonus: number,
): SpellAccessValues | null {
  const ability = answeredAbility(grant, ledger);
  const key = abilityKeyOf(ability);
  if (!key) return null;

  const abilityMod = mods[key] ?? 0;
  return {
    featureKey: grant.featureKey,
    sourceId: grant.sourceId,
    featureDe: spellAccessLabel(grant),
    abilityDe: ABILITY_LABEL[key],
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
    const abilityKey = abilityKeyOf(ability);
    if (!abilityKey) continue;

    const list = fixedList(grant) || answered(spellListChoiceId(grant));
    const listDe = list ? (CLASS_NAME_DE_BY_SLUG[resolveClass(list) ?? list] ?? '') : '';
    const source = listDe ? `${listDe}-Liste, ` : '';
    lines.push(`${spellAccessLabel(grant)}: ${source}Zauber über ${ABILITY_LABEL[abilityKey]}`);
  }
  return lines;
}

/**
 * Deklarierter Zauber-Zugang eines Merkmals (`grantsChoice.kind === 'spellAccess'`) —
 * „Magiekundiger" und alles, was mechanisch dasselbe tut: eine Zauberliste, ein
 * Zauberattribut und ein Kontingent je Gradband, alles NEBEN dem Klassen-Zauberwirken.
 *
 * Kein LLM. Wie `weaponMastery.ts`/`fightingStyle.ts` ist das die deterministische Antwort
 * auf ein geschlossenes Vokabular: die Zahlen stehen in der Deklaration, die Zaubernamen in
 * `vault/spells`. Ein Modell könnte hier nur die Anzahl verpatzen (ein `max: 1` für zwei
 * Zaubertricks kostet den Charakter still einen) oder eine Liste erfinden.
 *
 * Die Wahlen entstehen als `AnalysisChoice` — dieselbe Form, die die KI-Analyse liefert.
 * Damit tragen Oberfläche, Merkmals-Ledger und Anzeige-Logik nur EINEN Typ; der Unterschied
 * ist allein die Herkunft. Deutsch kommt aus vorhandenen Tabellen (`CLASS_NAME_DE_BY_SLUG`,
 * `CASTER_ABILITY_DE`), nicht aus einem Übersetzungs-Call.
 */
import type { AbilityName, FeatureChoiceGrant } from '$lib/schemas/shared';
import type { AbilityKey } from '$lib/schemas/classProgression';
import { resolveClass } from '$lib/spellLibrary';
import { ABILITY_FROM_EN, CLASS_NAME_DE_BY_SLUG } from './classProgression';
import { CASTER_ABILITY_DE, spellAttackBonus, spellSaveDC } from './spellcasting';
import { declaredChoice } from './declaredChoice';
import type { AnalysisChoice } from './aiActions/featureEffectsAction';

/** Ein Merkmal, das einen Zauber-Zugang deklarieren KANN (Talent oder Klassenmerkmal). */
export interface SpellAccessSource {
  key?: string;
  name: string;
  nameDe?: string;
  grantsChoice?: FeatureChoiceGrant;
}

/** Der aufgelöste Zugang: Listen/Attribute schon auf die zulässigen Werte eingeschränkt. */
export interface SpellAccessGrant {
  featureKey: string;
  /** Englischer Merkmalsname (kanonisch). */
  feature: string;
  /** Deutscher Anzeigename aus der Bibliothek. */
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
 * Liest die Deklaration aus und verengt sie um eine schon getroffene Festlegung.
 *
 * `specialisation` ist die Vorgabe der QUELLE des Merkmals — der Hintergrund „Weiser" gewährt
 * „Magic Initiate (Wizard)", „Kundschafter" gibt „Primal" vor. `resolveClass` normalisiert
 * beides (es kennt Klassennamen wie Traditionen); trifft die Vorgabe keinen deklarierten Wert,
 * bleibt die Liste vollständig — dann fragt der Flow, statt eine falsche Liste festzuschreiben.
 */
export function spellAccessGrantOf(
  feature: SpellAccessSource,
  specialisation = '',
): SpellAccessGrant | null {
  const grant = feature.grantsChoice;
  if (!grant || grant.kind !== 'spellAccess') return null;

  const declared = grant.spellLists.map((l) => l.toLowerCase().trim()).filter(Boolean);
  const fixed = specialisation.trim() ? resolveClass(specialisation) : null;
  const lists = fixed && declared.includes(fixed) ? [fixed] : declared;

  return {
    featureKey: feature.key ?? '',
    feature: feature.name,
    featureDe: feature.nameDe?.trim() || feature.name,
    lists,
    abilities: [...grant.spellAbilities],
    picks: grant.spellPicks.map((p) => ({ level: p.level, count: p.count })),
  };
}

/**
 * Merkmale OHNE die, deren Zauber-Zugang der Flow deterministisch führt — der KI-Eingang.
 * EINE Regel für Wizard und Aufstieg: ein zweiter Filter würde auseinanderlaufen und das
 * Merkmal auf einem der beiden Wege doppelt fragen lassen.
 */
export function withoutSpellAccessFeatures<T extends { key?: string }>(
  features: T[],
  grants: SpellAccessGrant[],
): T[] {
  const owned = new Set(grants.map((g) => g.featureKey).filter(Boolean));
  return features.filter((f) => !owned.has(f.key ?? ''));
}

// ── Wahl-ids ────────────────────────────────────────────────────────────────────
// Stabil und vom KI-Namensraum (`choice_<slug>_1`) unterscheidbar: die Antworten der
// deklarierten Wahlen gehen NICHT als <resolved_choices> ans Modell (das Merkmal steht
// nicht in dessen Eingang, es könnte die id nur einem erfundenen Rider zuordnen).
const slug = (grant: SpellAccessGrant): string =>
  (grant.featureKey || grant.feature).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const spellListChoiceId = (grant: SpellAccessGrant): string => `spellaccess_${slug(grant)}_list`;
export const spellAbilityChoiceId = (grant: SpellAccessGrant): string => `spellaccess_${slug(grant)}_ability`;
/**
 * Die id einer Zauber-Wahl trägt die LISTE mit. Sonst überlebt eine Auswahl den Wechsel der
 * Liste: wer zurückgeht und statt Magier den Kleriker nimmt, hätte weiter seine Magier-Zauber
 * im Zustand — mit der neuen id fällt sie beim Zusammenbauen heraus (`assembleCharacter`
 * nimmt nur Picks zu aktuell existierenden Wahlen).
 */
export const spellPickChoiceId = (grant: SpellAccessGrant, level: number, list: string): string =>
  `spellaccess_${slug(grant)}_${list}_pick${level}`;

/** Die festgelegte Zauberliste, sofern die Deklaration nur eine zulässt. */
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
 * Die Wahlen eines Zugangs, in der Reihenfolge, in der sie beantwortet werden müssen:
 * Liste → Attribut → Zauber je Gradband.
 *
 * `answeredList` ist die im Merkmals-Schritt getroffene Antwort auf die Listen-Frage. Solange
 * die Liste offen ist, entstehen KEINE Zauber-Wahlen — ein `SpellPicker` ohne Klassenfilter
 * würde die ganze Bibliothek anbieten und den Zauber-Schritt zugleich blockieren.
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
        // Die gewählten Zauber stehen danach im Zauber-Block des Charakters — ein zweiter
        // Eintrag im Merkmals-Ledger wäre eine zweite Wahrheit.
        isBuildDecision: false,
      });
    }
  }

  return choices;
}

// ── Auswertung der Antwort ──────────────────────────────────────────────────────
// Die Antworten stehen als `featureChoice` im Merkmals-Ledger (beide Wege: `buildDoc` im
// Aufstieg, `assembleCharacter` im Wizard). Zauber-SG und Angriffsbonus entstehen daraus
// erst zur ANZEIGEZEIT — wie die Waffenmeisterschaft, denn der Übungsbonus steigt.

/** Ein Ledger-Eintrag (`character.features[]`), soweit hier gebraucht. */
export interface FeatureChoiceEntry {
  sourceKey?: string;
  choice: string;
}

/**
 * Die festgelegte Attributs-Antwort: die Deklaration sagt, welche Werte zählen — ein
 * Namensvergleich würde die ASI-Wahl desselben Merkmals („Charisma") mitgreifen.
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

/** Die Zauberwerte dieses Zugangs — null, solange das Attribut offen ist (nichts wird geraten). */
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
 * Bogen-Notiz je Zugang, direkt auf Deutsch (kein Übersetzungs-Call). **Ohne Zahl** — SG und
 * Angriffsbonus hängen am Übungsbonus und wären ab Stufe 5 falsch; der Bogen-Freitext wird
 * nicht nachgerechnet. Die Zahlen stehen stattdessen im Zauber-Block der Karte.
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

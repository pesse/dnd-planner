/**
 * Deklarierte Zweigwahl (`grantsChoice.kind === 'optionList'`), ohne LLM. Weil die Wirkung
 * NEBEN der Option steht, entfällt der Zustand „Antwort bekannt, Wirkung erst danach": kein
 * `determinesFurtherEffects`, kein `blocked`, keine Nach-Analyse.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { type ChoiceOption } from '../../schemas/featureChoice';
import type { FeatureGrant } from '../../schemas/grants';
import { isCharacterPropertyRef } from '../characterProperties';
import { emptyRider } from './rider';
import {
  choiceGrants, choiceIdSuffix, declaredChoicesOf, declaredChoicesOfKind, featureIdPart,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';
export type { DeclaredChoiceRef, DeclaredChoiceSource };
import { isEmptyFeatureGrant, withGrant } from './grants';
import { isExpertiseRef } from './expertise';
import { isLanguagesRef } from './languages';


/** Ohne Optionen gibt es nichts zu fragen — die Deklaration ist dann unvollständig. */
export const isOptionListRef = (r: DeclaredChoiceRef): boolean =>
  r.grant.kind === 'optionList' && r.grant.options.length > 0;

export const optionListRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'optionList').filter(isOptionListRef);

export const isOptionListFeature = (f: DeclaredChoiceSource): boolean => optionListRefs(f).length > 0;

/** Die id der Wahl. Trägt den Merkmals-Key, damit zwei Zweigwahlen nie kollidieren. */
export const optionChoiceId = (r: DeclaredChoiceRef): string =>
  `optionlist_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * Deutsch kommt aus der Deklaration (`labelDe` = Zitat aus `descDe`), nie aus einem
 * Übersetzungs-Call; fehlt es, zeigt die Oberfläche den englischen Wert.
 */
export function optionListChoice(r: DeclaredChoiceRef): AnalysisChoice | null {
  if (!isOptionListRef(r)) return null;
  const { feature: f, grant } = r;
  const options = grant.options;
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: optionChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    question: `${f.name}: choose one`,
    questionDe: `${nameDe}: Wähle eine Option`,
    options: options.map((o) => o.value),
    optionsDe: options.map((o) => o.labelDe || o.value),
    optionHelp: {},
    optionHelpDe: Object.fromEntries(options.filter((o) => o.helpDe.trim()).map((o) => [o.value, o.helpDe])),
  };
}

export function optionListChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features.flatMap((f) => optionListRefs(f).map(optionListChoice)).filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Ob das Merkmal überhaupt eine Wahl DEKLARIERT — herkunftsfrei, denn jeder `kind` ist per
 * Definition flow-eigen: die Optionen kommen aus der Bibliothek, nie aus dem Modell. Nach
 * INHALT, nicht nach Anwesenheit: die leere Liste heißt „geprüft, gewährt keine Wahl", und
 * dann bleibt die Prosa des Merkmals Sache der KI-Kette.
 */
export const isFlowOwnedDeclaration = (f: DeclaredChoiceSource): boolean => choiceGrants(f).length > 0;

/** Ob der Flow diese Wahl selbst führt — Zweigwahl, Expertise, Sprache oder Grundeigenschaft. */
export const isDeclaredChoiceRef = (r: DeclaredChoiceRef): boolean =>
  isOptionListRef(r) || isExpertiseRef(r) || isLanguagesRef(r) || isCharacterPropertyRef(r);

/** Die selbstgeführten Wahlen eines Merkmals, in Deklarationsreihenfolge. */
export const declaredChoiceRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOf(f).filter(isDeclaredChoiceRef);

export const isDeclaredChoiceFeature = (f: DeclaredChoiceSource): boolean => declaredChoiceRefs(f).length > 0;

/**
 * Der KI-Eingang, EINE Regel für Wizard und Aufstieg — ein zweiter Filter liefe auseinander
 * und das Merkmal würde auf einem der beiden Wege doppelt gefragt. Deckt die Wege, die
 * `isFlowOwnedChoiceFeature` nicht sieht: Spezies- und nachgeladene Subklassen-Merkmale.
 */
export function withoutDeclaredChoiceFeatures<T extends DeclaredChoiceSource>(features: T[]): T[] {
  return features.filter((f) => !isDeclaredChoiceFeature(f));
}

/**
 * Merkmale, deren WAHL deklariert ist, deren WIRKUNG aber nicht. Sie gehören in den Eingang
 * von Pass C, nicht in den der Analyse — dort stellte das Modell dieselbe Frage ein zweites
 * Mal; nach dem Checkpoint deutet es nur noch, was `featureGrant` nicht ausdrücken kann.
 *
 * Diskriminator wie an jeder Deklaration: `options[].grants` FEHLT = nie redigiert, die KI
 * deutet. `{}` = geprüft, gewährt nichts — sonst zöge jede reine Zweigwahl den KI-Call
 * zurück, den die Deklaration gerade eingespart hat. Nur `optionList`: bei `expertise` IST
 * die Wahl der ganze Inhalt.
 *
 * Höchstens EIN Eintrag je Merkmal, auch bei mehreren Zweigwahlen: `GainedFeature.choice` ist
 * ein einzelner Wert, und zweimal dieselbe Prosa im Eingang erzeugte zwei Rider für dasselbe
 * Merkmal.
 */
export function unredactedChoiceFeatures<T extends DeclaredChoiceSource & { choice?: string }>(
  features: T[],
  answerOf: (choiceId: string) => string,
): (T & { choice: string })[] {
  const out: (T & { choice: string })[] = [];
  for (const f of features) {
    for (const r of optionListRefs(f)) {
      const answer = answerOf(optionChoiceId(r));
      const option = chosenOptionOf(r, answer);
      if (!option || option.grants) continue;
      out.push({ ...f, choice: answer });
      break;
    }
  }
  return out;
}

/** Die Option DIESER Wahl, gematcht über den kanonischen (englischen) Wert. */
export function chosenOptionOf(r: DeclaredChoiceRef, answer: string): ChoiceOption | null {
  if (!isOptionListRef(r)) return null;
  const want = answer.trim();
  return r.grant.options.find((o) => o.value === want) ?? null;
}

/**
 * Nur der WERT ist bekannt, nicht die Frage: der KI-Weg trägt die Antwort am MERKMAL
 * (`GainedFeature.choice`, `pastChoices`), nicht unter einer Frage-id. Über alle Zweigwahlen
 * des Merkmals gesucht — zwei davon böten dasselbe Label nur bei einer kaputten Deklaration an.
 */
export function chosenOption(f: DeclaredChoiceSource, answer: string): ChoiceOption | null {
  for (const r of optionListRefs(f)) {
    const option = chosenOptionOf(r, answer);
    if (option) return option;
  }
  return null;
}

/**
 * Ob die Option ein KONTINGENT einschaltet (`grantsCasting.quotas[].when.option`). Kleriker
 * und Druide deklarieren ihren Zusatz-Zaubertrick beides: als Quota und als `extraCantrips`.
 */
export function optionActivatesQuota(f: DeclaredChoiceSource, optionValue: string): boolean {
  const want = optionValue.trim();
  return !!want && !!f.grantsCasting?.quotas.some((q) => q.when?.option?.trim() === want);
}

/**
 * Die Quota ist die Senke der Zauber-Zahlen: schaltet die Option eine ein, zählt sie dort —
 * ein Rider daneben zählte dasselbe ein zweites Mal (`grantsCasting` ist erst nach dieser
 * Deklarationsart dazugekommen). Alles Übrige der Option bleibt.
 */
const withoutQuotaCounts = (grants: FeatureGrant): FeatureGrant =>
  ({ ...grants, extraCantrips: 0, extraPreparedCount: 0 });

/**
 * `sheetNote` bleibt LEER — die Notiz ist Pass-C-Arbeit, eine hier erfundene deutsche Zeile
 * stünde neben der englischen des Modells. `decisions` ebenso: die Wahl protokolliert
 * `featureChoiceChanges` aus dem Fragebogen, ein zweiter Eintrag wäre eine Dublette.
 */
export function optionListRider(r: DeclaredChoiceRef, answer: string, level: number): FeatureRider | null {
  const option = chosenOptionOf(r, answer);
  if (!option) return null;
  const spells = optionSpellsUpTo(option, level);
  const grants =
    option.grants && optionActivatesQuota(r.feature, option.value) ? withoutQuotaCounts(option.grants) : option.grants;
  const declaresGrant = !!grants && !isEmptyFeatureGrant(grants);
  if (!declaresGrant && !spells.length) return null;
  const base: FeatureRider = { ...emptyRider(r.feature), grantedSpells: spells };
  return declaresGrant ? withGrant(base, grants) : base;
}

/**
 * Kumulativ wie die Stufentabelle. Höhere Zeilen kommen beim Aufstieg dazu, deshalb liest
 * `optionSpellNames` sie später über die GESPEICHERTE Antwort noch einmal.
 */
function optionSpellsUpTo(option: ChoiceOption, level: number): string[] {
  const out: string[] = [];
  for (const row of option.spells) {
    if (row.level > level) continue;
    for (const name of row.names) if (name.trim() && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Für Zeilen, die erst später greifen (Elfenabstammung 3 und 5): die Antwort steht am
 * Charakter, nicht im Fragebogen — ein Aufstieg stellt die Wahl der Erschaffung nicht erneut.
 */
export function optionSpellNames(
  features: DeclaredChoiceSource[],
  answerOf: (f: DeclaredChoiceSource) => string,
  level: number,
): string[] {
  const out: string[] = [];
  for (const f of features) {
    const option = chosenOption(f, answerOf(f));
    if (!option) continue;
    for (const name of optionSpellsUpTo(option, level)) if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** `level` gilt für `options[].spells`. */
export function optionListRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
  level: number,
): FeatureRider[] {
  return features
    .flatMap((f) => optionListRefs(f).map((r) => optionListRider(r, answerOf(optionChoiceId(r)), level)))
    .filter((r): r is FeatureRider => r !== null);
}

/**
 * Das Merkmal steht nicht mehr im KI-Eingang, also schreibt Pass C keine `sheetNote` dafür —
 * ohne diese Zeile stünde die getroffene Wahl nirgends auf dem Bogen. Sie ist ein Zitat aus
 * `labelDe`/`helpDe`, keine Übersetzung zur Laufzeit.
 */
export function optionListNoteLines(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): string[] {
  const lines: string[] = [];
  for (const f of features)
    for (const r of optionListRefs(f)) {
      const option = chosenOptionOf(r, answerOf(optionChoiceId(r)));
      if (!option) continue;
      const label = option.labelDe || option.value;
      const help = option.helpDe.trim();
      lines.push(`${f.nameDe || f.name}: ${label}${help ? ` — ${help}` : ''}`);
    }
  return lines;
}

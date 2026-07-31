/**
 * Deklarierte Zweigwahl eines Merkmals (`grantsChoice.kind === 'optionList'`) — Urtümlicher
 * Orden, Göttlicher Orden und alles, was mechanisch dasselbe tut.
 *
 * Kein LLM, und der Gewinn liegt nicht im Weglassen eines Calls, sondern im Wegfall eines
 * ZUSTANDS: weil die Wirkung neben der Option steht, gibt es kein „Antwort bekannt, Wirkung
 * erst danach berechenbar" mehr — kein `determinesFurtherEffects`, kein `blocked`, keine
 * Nach-Analyse (gemessen 30–40 s je Kette).
 *
 * Die Wahl entsteht als `AnalysisChoice`, die Wirkung als `FeatureRider` — dieselben zwei
 * Typen, die die KI liefert. Damit ist alles dahinter unverändert.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { type ChoiceOption, type FeatureChoiceGrant } from '../../schemas/featureChoice';
import { isCharacterPropertyFeature } from '../characterProperties';
import type { FeatureSource } from '../declaredFeature';
import { featureIdOf } from '$lib/utils/text';
import { emptyRider } from './rider';
import type { Declared, DeclaredChoiceSource } from './source';
export type { DeclaredChoiceSource };
import { isEmptyFeatureGrant, withGrant } from './grants';
import { isExpertiseFeature } from './expertise';


export function isOptionListFeature(f: DeclaredChoiceSource): f is Declared {
  return f.grantsChoice?.kind === 'optionList' && f.grantsChoice.options.length > 0;
}

/** Die id der Wahl. Trägt den Merkmals-Key, damit zwei Zweigwahlen nie kollidieren. */
export const optionChoiceId = (f: DeclaredChoiceSource): string =>
  `optionlist_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * Die Wahl eines deklarierten Zweig-Merkmals. `determinesFurtherEffects` ist per Konstruktion
 * false — die Wirkung steht schon in der Deklaration. `isBuildDecision` ist true: eine
 * Zweigwahl ist dauerhaft und gehört ins Merkmals-Ledger.
 *
 * Deutsch kommt aus der Deklaration (`labelDe` = Zitat aus `descDe`), nicht aus einem
 * Übersetzungs-Call. Fehlt es, zeigt die Oberfläche den englischen Wert — wie bei einer
 * fehlgeschlagenen Übersetzung.
 */
export function optionListChoice(f: DeclaredChoiceSource): AnalysisChoice | null {
  if (!isOptionListFeature(f)) return null;
  const options = f.grantsChoice.options;
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: optionChoiceId(f), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    question: `${f.name}: choose one`,
    questionDe: `${nameDe}: Wähle eine Option`,
    options: options.map((o) => o.value),
    optionsDe: options.map((o) => o.labelDe || o.value),
    optionHelp: {},
    optionHelpDe: Object.fromEntries(options.filter((o) => o.helpDe.trim()).map((o) => [o.value, o.helpDe])),
  };
}

/** Alle deklarierten Zweigwahlen einer Merkmalsliste, in Eingangsreihenfolge. */
export function optionListChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features.map(optionListChoice).filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Ob das Merkmal überhaupt eine Wahl DEKLARIERT — herkunftsfrei, denn jeder `kind` ist per
 * Definition flow-eigen: die Optionen kommen aus der Bibliothek, nie aus dem Modell.
 */
export const isFlowOwnedDeclaration = (f: DeclaredChoiceSource): boolean => !!f.grantsChoice;

/** Ob der Flow die Wahl dieses Merkmals selbst führt — `optionList`, `expertise` oder Eigenschaft. */
export function isDeclaredChoiceFeature(f: DeclaredChoiceSource): boolean {
  return isOptionListFeature(f) || isExpertiseFeature(f) || isCharacterPropertyFeature(f);
}

/**
 * Merkmale OHNE die, deren Wahl der Flow deterministisch führt — der KI-Eingang.
 * EINE Regel für Wizard und Aufstieg, aus demselben Grund wie bei
 * `withoutSpellAccessFeatures`: ein zweiter Filter liefe auseinander und das Merkmal würde
 * auf einem der beiden Wege doppelt gefragt.
 *
 * Für Klassenmerkmale des Aufstiegs erledigt das schon `isFlowOwnedChoiceFeature`
 * (services/levelUp.ts). Dieser Filter deckt die beiden Wege, die dort NICHT durchlaufen:
 * Speziesmerkmale (der Wizard hat für sie kein Sieb) und die nach der Subklassen-Wahl
 * nachgeladenen Subklassen-Merkmale (`computeSubclassFeatures`).
 */
export function withoutDeclaredChoiceFeatures<T extends DeclaredChoiceSource>(features: T[]): T[] {
  return features.filter((f) => !isDeclaredChoiceFeature(f));
}

/**
 * Merkmale, deren WAHL deklariert ist, deren WIRKUNG aber nicht — mit der getroffenen Antwort
 * als `choice`.
 *
 * Sie gehören in den Eingang von Pass C, nicht in den der Analyse: dort würde das Modell
 * dieselbe Frage ein zweites Mal stellen. Nach dem Checkpoint steht die Antwort, und der
 * Prompt behandelt `choice` als FINAL — damit deutet die KI genau das, was die Deklaration
 * nicht ausdrücken kann (Elfenabstammung: „Reichweite deiner Dunkelsicht erhöht sich auf
 * 36 Meter", eine Mechanik, für die `featureGrant` kein Feld hat).
 *
 * Der Diskriminator ist derselbe wie an jeder Deklaration: `options[].grants` FEHLT = nie
 * redigiert, also deutet die KI. `{}` = geprüft, gewährt nichts — dann gibt es nichts zu
 * deuten und das Merkmal bleibt draußen. Ohne diese Unterscheidung zöge jede reine Zweigwahl
 * (Urtümlicher Orden) den KI-Call zurück, den die Deklaration gerade eingespart hat.
 *
 * Nur `optionList`: bei `expertise` IST die Wahl der ganze Inhalt.
 */
export function unredactedChoiceFeatures<T extends DeclaredChoiceSource & { choice?: string }>(
  features: T[],
  answerOf: (f: DeclaredChoiceSource) => string,
): (T & { choice: string })[] {
  const out: (T & { choice: string })[] = [];
  for (const f of features) {
    if (!isOptionListFeature(f)) continue;
    const answer = answerOf(f);
    const option = chosenOption(f, answer);
    if (!option || option.grants) continue;
    out.push({ ...f, choice: answer });
  }
  return out;
}

/** Die gewählte Option, gematcht über den kanonischen (englischen) Wert. */
export function chosenOption(f: DeclaredChoiceSource, answer: string): ChoiceOption | null {
  if (!isOptionListFeature(f)) return null;
  const want = answer.trim();
  return f.grantsChoice.options.find((o) => o.value === want) ?? null;
}

/**
 * Die Wirkung der getroffenen Wahl als `FeatureRider` — leer, solange nichts gewählt ist
 * oder die Option nichts gewährt.
 *
 * `sheetNote` bleibt LEER: die Notiz ist noch KI-Arbeit (Pass C sieht sie über
 * `<past_choices>`), und eine hier erfundene deutsche Zeile stünde neben der englischen des
 * Modells. `decisions` bleibt ebenfalls leer — die Wahl protokolliert
 * `featureChoiceChanges` aus dem Fragebogen, ein zweiter Eintrag wäre eine Dublette.
 */
export function optionListRider(f: DeclaredChoiceSource, answer: string, level: number): FeatureRider | null {
  const option = chosenOption(f, answer);
  if (!option) return null;
  const spells = optionSpellsUpTo(option, level);
  const grants = option.grants;
  const declaresGrant = !!grants && !isEmptyFeatureGrant(grants);
  if (!declaresGrant && !spells.length) return null;
  const base: FeatureRider = { ...emptyRider(f), grantedSpells: spells };
  return declaresGrant ? withGrant(base, grants) : base;
}

/**
 * Die Zauber einer Option bis `level` — kumulativ wie die Stufentabelle („für deine Stufe und
 * niedriger", `declaredSpellGrants`). Höhere Zeilen kommen beim Aufstieg dazu, deshalb liest
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
 * Die Zauber der bereits GEWÄHLTEN Option auf `level` — der Weg für Zeilen, die erst später
 * greifen (Elfenabstammung Stufe 3 und 5). Die Antwort steht am Charakter, nicht im Fragebogen:
 * ein Aufstieg stellt die Wahl der Erschaffung nicht erneut.
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

/** Rider aller beantworteten Zweigwahlen einer Merkmalsliste. `level` gilt für `options[].spells`. */
export function optionListRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
  level: number,
): FeatureRider[] {
  return features
    .map((f) => optionListRider(f, answerOf(optionChoiceId(f)), level))
    .filter((r): r is FeatureRider => r !== null);
}

/**
 * Die Bogen-Zeile einer getroffenen Zweigwahl, deutsch, aus der Deklaration.
 *
 * Nötig aus demselben Grund wie `spellAccessNoteLines`: das Merkmal steht nicht mehr im
 * KI-Eingang, also schreibt Pass C keine `sheetNote` mehr dafür — ohne diese Zeile stünde
 * die getroffene Wahl nirgends auf dem Bogen. Und hier zahlt sich `labelDe`/`helpDe` aus:
 * die Zeile ist ein Zitat plus eine redigierte Konsequenz, keine Übersetzung zur Laufzeit.
 */
export function optionListNoteLines(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): string[] {
  const lines: string[] = [];
  for (const f of features) {
    const option = chosenOption(f, answerOf(optionChoiceId(f)));
    if (!option) continue;
    const label = option.labelDe || option.value;
    const help = option.helpDe.trim();
    lines.push(`${f.nameDe || f.name}: ${label}${help ? ` — ${help}` : ''}`);
  }
  return lines;
}

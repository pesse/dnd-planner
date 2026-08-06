/**
 * Sprachwahl (`grantsChoice.kind === 'languages'`) — der einzige `kind` ganz OHNE Vokabular:
 * Sprachen sind deutscher Freitext und in 2024 nicht einmal mehr eine Übung. Deshalb eine
 * Freitextfrage statt einer Optionsliste; die Antwort geht unverändert nach
 * `riderProficiencies.languages` und von dort als `Change { target: 'language' }` auf den Bogen.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isLanguagesRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'languages';

export const languageRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'languages');

export const isLanguagesFeature = (f: DeclaredChoiceSource): boolean => languageRefs(f).length > 0;

export const languageChoiceId = (r: DeclaredChoiceRef): string =>
  `languages_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * Mehrere Sprachen stehen kommagetrennt in EINER Antwort — nicht als `multiselect`, dem die
 * Optionen fehlten. Anders als jede andere Wahl trägt sie kein englisches Kanonisch: es gibt
 * keine Liste, aus der es käme, also ist der getippte deutsche Name auch der gespeicherte Wert.
 */
export function languageChoice(r: DeclaredChoiceRef): AnalysisChoice | null {
  if (!isLanguagesRef(r)) return null;
  const f = r.feature;
  const count = Math.max(1, r.grant.count);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: languageChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'text',
    max: count,
    question: `${f.name}: name ${count} language(s) of your choice`,
    questionDe: count > 1 ? `${nameDe}: Wähle ${count} Sprachen` : `${nameDe}: Wähle eine Sprache`,
    help: 'Free text — languages have no closed vocabulary.',
    helpDe: count > 1 ? 'Freitext, mehrere durch Komma trennen.' : 'Freitext.',
  };
}

export function languageChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features
    .flatMap((f) => languageRefs(f).map(languageChoice))
    .filter((c): c is AnalysisChoice => c !== null);
}

export function languageRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  const languages = picked.map((s) => s.trim()).filter(Boolean);
  if (!isLanguagesRef(r) || !languages.length) return null;
  const rider = emptyRider(r.feature);
  return { ...rider, proficiencies: { ...rider.proficiencies, languages } };
}

export function languageRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) => languageRefs(f).map((r) => languageRider(r, splitChoiceAnswer(answerOf(languageChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}

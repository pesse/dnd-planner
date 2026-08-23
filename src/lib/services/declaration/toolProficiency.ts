/**
 * Werkzeug-Wahl (`grantsChoice.kind === 'toolProficiency'`) — dieselbe Form wie die Sprachwahl:
 * kein Vokabular, also eine Freitextfrage statt einer Optionsliste. Die Antwort geht unverändert
 * nach `riderProficiencies.tools` und von dort als `Change { target: 'toolProficiency' }` auf
 * den Bogen.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

export const isToolProficiencyRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'toolProficiency';

export const toolProficiencyRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'toolProficiency');

export const isToolProficiencyFeature = (f: DeclaredChoiceSource): boolean => toolProficiencyRefs(f).length > 0;

export const toolProficiencyChoiceId = (r: DeclaredChoiceRef): string =>
  `tools_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/** Mehrere Werkzeuge stehen kommagetrennt in EINER Antwort, wie bei den Sprachen. */
export function toolProficiencyChoice(r: DeclaredChoiceRef): AnalysisChoice | null {
  if (!isToolProficiencyRef(r)) return null;
  const f = r.feature;
  const count = Math.max(1, r.grant.count);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: toolProficiencyChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'text',
    max: count,
    question: `${f.name}: name ${count} tool(s) of your choice`,
    questionDe: count > 1 ? `${nameDe}: Wähle ${count} Werkzeuge` : `${nameDe}: Wähle ein Werkzeug`,
    helpDe: count > 1 ? 'Freitext, mehrere durch Komma trennen.' : 'Freitext.',
  };
}

export function toolProficiencyChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features
    .flatMap((f) => toolProficiencyRefs(f).map(toolProficiencyChoice))
    .filter((c): c is AnalysisChoice => c !== null);
}

export function toolProficiencyRider(r: DeclaredChoiceRef, picked: readonly string[]): FeatureRider | null {
  const tools = picked.map((s) => s.trim()).filter(Boolean);
  if (!isToolProficiencyRef(r) || !tools.length) return null;
  const rider = emptyRider(r.feature);
  return { ...rider, proficiencies: { ...rider.proficiencies, tools } };
}

export function toolProficiencyRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .flatMap((f) =>
      toolProficiencyRefs(f).map((r) =>
        toolProficiencyRider(r, splitChoiceAnswer(answerOf(toolProficiencyChoiceId(r))))))
    .filter((r): r is FeatureRider => r !== null);
}

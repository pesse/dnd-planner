/**
 * Werkzeug-Wahl (`grantsChoice.kind === 'toolProficiency'`) — Optionen aus `items/tools/`,
 * eingegrenzt durch `toolCategory`. Die Antwort geht unverändert nach
 * `riderProficiencies.tools` und von dort als `Change { target: 'toolProficiency' }` auf
 * den Bogen. Ohne geladene Bibliothek bleibt es bei der Freitextfrage.
 */
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureRider } from '../../schemas/levelUp';
import { declaredChoice } from '../declaredChoice';
import { toolsOfCategory } from '../../itemLibrary';
import { emptyRider } from './rider';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, splitChoiceAnswer,
  type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './source';

/** Strukturell erfüllt von `ItemInfo` — von einem Werkzeug braucht die Wahl nur das. */
export interface ToolItem {
  name: string;
  name_de?: string;
  index?: string;
}

export const isToolProficiencyRef = (r: DeclaredChoiceRef): boolean => r.grant.kind === 'toolProficiency';

export const toolProficiencyRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'toolProficiency');

export const isToolProficiencyFeature = (f: DeclaredChoiceSource): boolean => toolProficiencyRefs(f).length > 0;

export const toolProficiencyChoiceId = (r: DeclaredChoiceRef): string =>
  `tools_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * Der Wert IST der deutsche Name (Werkzeuge haben kein englisches Vokabular, er landet
 * unverändert auf dem Bogen) — nur kommafrei: die Antwortkodierung trennt mit Komma, und die
 * Bibliothek listet ihre Familien als „Musikinstrument, Dudelsack".
 */
export function toolLabel(item: ToolItem): string {
  const name = item.name_de ?? item.name;
  const i = name.indexOf(',');
  return i < 0 ? name : `${name.slice(i + 1).trim()} (${name.slice(0, i).trim()})`;
}

export const toolOptionsOf = (r: DeclaredChoiceRef, tools: readonly ToolItem[]): string[] =>
  [...new Set(toolsOfCategory(tools, r.grant.toolCategory).map(toolLabel).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));

const CATEGORY_DE: Record<string, string> = {
  '': 'Werkzeug', 'artisan-tools': 'Handwerkszeug', instrument: 'Musikinstrument',
};

/** Mehrere Werkzeuge stehen kommagetrennt in EINER Antwort, wie bei den Sprachen. */
export function toolProficiencyChoice(r: DeclaredChoiceRef, tools: readonly ToolItem[] = []): AnalysisChoice | null {
  if (!isToolProficiencyRef(r)) return null;
  const f = r.feature;
  const count = Math.max(1, r.grant.count);
  const nameDe = f.nameDe || f.name;
  const wordDe = CATEGORY_DE[r.grant.toolCategory] ?? CATEGORY_DE[''];
  const base = {
    ...declaredChoice({ id: toolProficiencyChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    max: count,
    question: `${f.name}: name ${count} ${r.grant.toolCategory || 'tool'}(s) of your choice`,
    questionDe: count > 1 ? `${nameDe}: Wähle ${count} ${wordDe}e` : `${nameDe}: Wähle ein ${wordDe}`,
  };
  const options = toolOptionsOf(r, tools);
  // Der Rider nimmt die Antwort wörtlich — also ist der Options-Wert schon die Anzeige,
  // `optionsDe` bliebe seine eigene Kopie.
  if (options.length) return { ...base, type: 'multiselect', max: Math.min(count, options.length), options, helpDe: '' };
  return { ...base, type: 'text', helpDe: count > 1 ? 'Freitext, mehrere durch Komma trennen.' : 'Freitext.' };
}

export function toolProficiencyChoices(
  features: DeclaredChoiceSource[],
  tools: readonly ToolItem[] = [],
): AnalysisChoice[] {
  return features
    .flatMap((f) => toolProficiencyRefs(f).map((r) => toolProficiencyChoice(r, tools)))
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

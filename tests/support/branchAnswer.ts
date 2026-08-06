/** Antwortet nur auf die Zweigwahl EINES Merkmals — der Fragebogen fragt über die Frage-id. */
import { optionChoiceId, optionListRefs } from '../../src/lib/services/declaration/optionList';
import type { DeclaredChoiceSource } from '../../src/lib/services/declaration/source';

export function branchAnswerOf(
  declared: DeclaredChoiceSource[],
  featureKey: string,
  answer: string,
): (choiceId: string) => string {
  const ids = new Set(
    declared.filter((f) => f.key === featureKey).flatMap((f) => optionListRefs(f).map(optionChoiceId)),
  );
  return (id) => (ids.has(id) ? answer : '');
}

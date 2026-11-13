/** In welchem Wizard-Schritt eine Merkmalswahl steht: bei dem, was sie mitgebracht hat. */
import type { AnalysisChoice } from '../analysis/types';
import { spellAccessParts, spellAccessPartId, type SpellAccessGrant } from '../spellcasting/access';
import type { FeatOwner } from './featurePrep';

/** `''` = Schritt „Merkmale". */
export type ChoiceOwner = string;

export const BACKGROUND_OWNER = 'background';

export function choiceOwnerOf(params: {
  backgroundKey: string;
  featOwners: readonly FeatOwner[];
  spellAccess: readonly SpellAccessGrant[];
}): (choice: AnalysisChoice) => ChoiceOwner {
  const { backgroundKey, featOwners, spellAccess } = params;
  // Liste und Attribut tragen die Instanz nur in der id: dasselbe Talent kann aus Hintergrund
  // UND Vielseitig kommen, und jedes Exemplar fragt in seinem Schritt.
  const byPartId = new Map<string, ChoiceOwner>();
  for (const grant of spellAccess) {
    const owner = featOwners.find((o) => o.sourceId === grant.sourceId)?.owner;
    if (owner) for (const part of spellAccessParts(grant)) byPartId.set(spellAccessPartId(grant, part), owner);
  }
  return (choice) => {
    const byPart = byPartId.get(choice.id);
    if (byPart) return byPart;
    if (backgroundKey && choice.featureKey === backgroundKey) return BACKGROUND_OWNER;
    return featOwners.find((o) => o.featureKey === choice.featureKey)?.owner ?? '';
  };
}

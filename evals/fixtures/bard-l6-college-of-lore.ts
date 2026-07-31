/**
 * Fixture: Barde 5 → 6 mit „Kolleg des Wissens" — „Magische Entdeckungen".
 *
 * Warum dieser Fall: er ist der härteste verbleibende Kunde der spell-pick-Regel im
 * Analyse-Prompt (Inventur in `evals/spellChoiceCoverage.test.ts`). Zwei Zauber „of your
 * choice" aus DREI Listen, Gradband „ein Zaubertrick oder ein Grad, für den du Plätze hast"
 * — auf Stufe 6 also 0 bis 3. Die Regel muss daraus Kontingent (2), Gradband und Liste
 * ableiten; nichts davon steht als Zahl im Text.
 *
 * Merkmale kommen über den ECHTEN Produktionspfad (`computeSubclassFeatures` → Vault), wie
 * im `subclass-delta`-Schritt des Assistenten. Der Barde selbst gewinnt auf Stufe 6 kein
 * Klassenmerkmal, der Eingang ist also genau dieses eine Merkmal.
 */
import type { FeatureClassContext, GainedFeature } from '../../src/lib/services/aiActions/featureEffectsAction';
import { computeSubclassFeatures } from '../../src/lib/services/levelUpMachine';

export const COLLEGE_OF_LORE_KEY = 'srd-2024_college-of-lore';

export const FROM_LEVEL = 5;
export const TO_LEVEL = 6;

/** Die drei Listen, aus denen „Magische Entdeckungen" wählen lässt (englische Klassen-Keys). */
export const ALLOWED_LISTS = ['cleric', 'druid', 'wizard'];

/** Zaubertricks plus die Grade, für die ein Barde auf Stufe 6 Plätze hat. */
export const ALLOWED_SPELL_LEVELS = [0, 1, 2, 3];

/** Wie viele Zauber das Merkmal gewährt. */
export const EXPECTED_PICK_COUNT = 2;

export async function loadMagicalDiscoveries(): Promise<GainedFeature[]> {
  return computeSubclassFeatures(COLLEGE_OF_LORE_KEY, FROM_LEVEL, TO_LEVEL);
}

export const bardClassContext: FeatureClassContext = {
  klasseName: 'Barde',
  subclassName: 'Kolleg des Wissens',
  casterType: 'FULL',
  casterKind: 'prepared',
  spellcastingAbility: 'cha',
  toLevel: TO_LEVEL,
};

/**
 * Was jede Deklarations-Prüfung von einem Merkmal braucht. Eigenes Modul, weil sonst jede
 * Deklarationsart einen Zyklus zu der schließt, die den Typ zufällig hält.
 */
import type { FeatureChoiceGrant } from '../../schemas/featureChoice';
import type { FeatureSource } from '../declaredFeature';

/** Klassenmerkmal, Trait und Talent erfüllen das gleichermaßen. */
export interface DeclaredChoiceSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  grantsChoice?: FeatureChoiceGrant;
}

/** Ein Merkmal, dessen Deklaration feststeht — spart die Nicht-Null-Behauptungen dahinter. */
export type Declared = DeclaredChoiceSource & { grantsChoice: FeatureChoiceGrant };

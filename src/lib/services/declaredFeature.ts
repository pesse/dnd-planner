/**
 * Ein deklariertes Merkmal samt HERKUNFT — die eine Sicht aller Deklarations-Verbraucher.
 * `source` steht in KEINEM Vault-Schema: ein Trait weiß nicht, dass es eins ist, der Flow
 * weiß es. Strukturell statt nominal, damit die Builder rohe Bibliotheksobjekte nehmen.
 */
import type { FeatureChoiceGrant } from '../schemas/featureChoice';
import type { FeatureGrant, SpellGrant } from '../schemas/grants';
import type { CastingGrant } from '../schemas/casting';

export type FeatureSource = 'class' | 'subclass' | 'species' | 'feat';

/**
 * Die Mechanik fragt NIE nach `source` — es entscheidet allein über die Bogen-Zeile. `desc`
 * trägt die Zauber-Stufentabelle, damit erfüllt der Typ auch `SpellGrantSource`.
 */
export interface DeclaredFeature {
  key?: string;
  /** Englischer Name — der Anker, gegen den die Rider matchen. */
  name: string;
  nameDe?: string;
  desc?: string;
  source: FeatureSource;
  grants?: FeatureGrant;
  grantsChoice?: FeatureChoiceGrant[];
  grantsSpells?: SpellGrant;
  grantsCasting?: CastingGrant;
  /** Teil-Deklaration: für den Rest schreibt die KI eine Bogen-Notiz, mehr nicht. */
  aiInterpretsRest?: boolean;
}

export function declaredFeatures<T extends Omit<DeclaredFeature, 'source'>>(
  source: FeatureSource,
  features: readonly T[],
): DeclaredFeature[] {
  return features.map((f) => ({ ...f, source }));
}

/**
 * Die EINZIGE Stelle, an der die Herkunft entscheidet: ein Speziesmerkmal steht schon im
 * Volksmerkmale-Text, eine Zeile im Klassenfeld wäre die Dublette.
 */
export const forClassFeaturesField = (f: DeclaredFeature): boolean => f.source !== 'species';

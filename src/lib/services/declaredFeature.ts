/**
 * Ein deklariertes Merkmal samt HERKUNFT — die eine Sicht, aus der alle
 * Deklarations-Verbraucher lesen (Wahlen, Grants, Zauberlisten, TP je Stufe).
 *
 * `source` steht in KEINEM Vault-Schema: ein Trait weiß nicht, dass es ein Speziesmerkmal
 * ist, der Flow weiß es. Strukturell statt nominal, damit die Builder weiter rohe
 * Bibliotheksobjekte nehmen — eine Pflicht-Projektion wäre die Drift, gegen die
 * `withoutDeclaredChoiceFeatures` überhaupt geschrieben wurde.
 */
import type { FeatureChoiceGrant } from '../schemas/featureChoice';
import type { FeatureGrant, SpellGrant } from '../schemas/grants';

export type FeatureSource = 'class' | 'subclass' | 'species' | 'feat';

/**
 * Die Mechanik fragt NIE nach `source` — es entscheidet allein über die Bogen-Zeile
 * (`forClassFeaturesField`). `desc` trägt die Zauber-Stufentabelle (Prosa, `grantedSpells.ts`);
 * damit erfüllt dieser Typ auch `SpellGrantSource`.
 */
export interface DeclaredFeature {
  key?: string;
  /** Englischer Name — der Anker, gegen den die Rider matchen. */
  name: string;
  nameDe?: string;
  desc?: string;
  source: FeatureSource;
  grants?: FeatureGrant;
  grantsChoice?: FeatureChoiceGrant;
  grantsSpells?: SpellGrant;
}

/** Hängt die Herkunft an rohe Bibliotheksmerkmale. */
export function declaredFeatures<T extends Omit<DeclaredFeature, 'source'>>(
  source: FeatureSource,
  features: readonly T[],
): DeclaredFeature[] {
  return features.map((f) => ({ ...f, source }));
}

/**
 * Die EINZIGE Stelle, an der die Herkunft entscheidet. Ein Speziesmerkmal steht im
 * Volksmerkmale-Text und trägt seine Wahl als `SummaryFeature.choice` — eine Zeile im
 * Klassenfeld wäre die Dublette.
 */
export const forClassFeaturesField = (f: DeclaredFeature): boolean => f.source !== 'species';

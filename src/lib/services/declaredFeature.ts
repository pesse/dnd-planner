/**
 * Ein deklariertes Merkmal samt HERKUNFT — die eine Sicht aller Deklarations-Verbraucher.
 * `source` steht in KEINEM Vault-Schema: ein Trait weiß nicht, dass es eins ist, der Flow
 * weiß es. Strukturell statt nominal, damit die Builder rohe Bibliotheksobjekte nehmen.
 */
import type { z } from 'zod';
import { featureDeclarationFields } from '../schemas/featureChoice';

/** Der Feldsatz des Schemas als Typ — nicht abgeschrieben, damit ein neues Feld hier ankommt. */
export type DeclarationFields = {
  [K in keyof typeof featureDeclarationFields]?: z.infer<(typeof featureDeclarationFields)[K]>;
};

/** Was Mechanik gewährt; `aiInterpretsRest` erklärt eine Deklaration, ist selbst keine. */
export type GrantFields = Omit<DeclarationFields, 'aiInterpretsRest'>;

/** Total getippt: ein sechstes Gewährungsfeld im Schema ist hier ein Compile-Fehler. */
const GRANT_FIELDS: Record<keyof GrantFields, true> = {
  grants: true,
  grantsChoice: true,
  grantsSpells: true,
  grantsCasting: true,
  grantsResource: true,
};

export const GRANT_KEYS = Object.keys(GRANT_FIELDS) as (keyof GrantFields)[];

const DECLARATION_KEYS: (keyof DeclarationFields)[] = [...GRANT_KEYS, 'aiInterpretsRest'];

/**
 * Die Deklaration eines Bibliotheks-Merkmals, vollständig. Jede handaufgezählte Kopie ließ
 * bisher ein Feld fallen — bei `grantsCasting` war das ein verlorener Zauber-Zugang.
 */
export function declarationOf(f: DeclarationFields): DeclarationFields {
  const out: Record<string, unknown> = {};
  for (const key of DECLARATION_KEYS) if (f[key] !== undefined) out[key] = f[key];
  return out as DeclarationFields;
}

/**
 * Dieselbe Übernahme aus ROHEM JSON, für die feldweisen Bibliotheks-Lesepfade: was das Schema
 * nicht liest, gilt als nicht deklariert.
 */
export function parseDeclaration(raw: Record<string, unknown>): DeclarationFields {
  const out: Record<string, unknown> = {};
  for (const key of DECLARATION_KEYS) {
    const parsed = (featureDeclarationFields[key] as z.ZodTypeAny).safeParse(raw[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  return out as DeclarationFields;
}

export type FeatureSource = 'class' | 'subclass' | 'species' | 'feat';

/**
 * Die Mechanik fragt NIE nach `source` — es entscheidet allein über die Bogen-Zeile. `desc`
 * trägt die Zauber-Stufentabelle, damit erfüllt der Typ auch `SpellGrantSource`.
 */
export interface DeclaredFeature extends DeclarationFields {
  key?: string;
  /** Englischer Name — der Anker, gegen den die Rider matchen. */
  name: string;
  nameDe?: string;
  desc?: string;
  source: FeatureSource;
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

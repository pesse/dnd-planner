/**
 * Was jede Deklarations-Prüfung von einem Merkmal braucht. Eigenes Modul, weil sonst jede
 * Deklarationsart einen Zyklus zu der schließt, die den Typ zufällig hält.
 */
import type { CastingGrant } from '../../schemas/casting';
import type { FeatureChoiceGrant, FeatureChoiceKind } from '../../schemas/featureChoice';
import type { FeatureSource } from '../declaredFeature';

/** Klassenmerkmal, Trait und Talent erfüllen das gleichermaßen. */
export interface DeclaredChoiceSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  /** Mehrere: ein Merkmal kann Expertise UND Sprachen erzwingen. Leer ≠ fehlend (`isRedacted`). */
  grantsChoice?: FeatureChoiceGrant[];
  /** Stellt Liste und Attribut zur Wahl — unabhängig von jedem `grantsChoice.kind`. */
  grantsCasting?: CastingGrant;
}

/**
 * Eine deklarierte Wahl AN ihrem Merkmal. Das Paar ist die kleinste sinnvolle Einheit, seit ein
 * Merkmal mehrere Wahlen stellt — wer nur das Merkmal weiterreicht, verliert alle bis auf eine.
 */
export interface DeclaredChoiceRef<T extends DeclaredChoiceSource = DeclaredChoiceSource> {
  feature: T;
  grant: FeatureChoiceGrant;
  /**
   * Laufende Nummer unter den Wahlen GLEICHER Art an diesem Merkmal, 0 = die erste. Nur sie
   * geht in die Frage-id ein, und zwar erst ab 1 — sonst verlöre jede gespeicherte Antwort
   * ihren Anker (`characterFeatureSchema.choiceId`).
   */
  ordinal: number;
}

export const choiceGrants = (f: DeclaredChoiceSource): FeatureChoiceGrant[] => f.grantsChoice ?? [];

/** Alle deklarierten Wahlen, in Deklarationsreihenfolge. */
export function declaredChoicesOf<T extends DeclaredChoiceSource>(feature: T): DeclaredChoiceRef<T>[] {
  const seen = new Map<FeatureChoiceKind, number>();
  return choiceGrants(feature).map((grant) => {
    const ordinal = seen.get(grant.kind) ?? 0;
    seen.set(grant.kind, ordinal + 1);
    return { feature, grant, ordinal };
  });
}

/** Die Wahlen einer Art — leer, wenn das Merkmal sie nicht deklariert. */
export function declaredChoicesOfKind<T extends DeclaredChoiceSource>(
  feature: T,
  kind: FeatureChoiceKind,
): DeclaredChoiceRef<T>[] {
  return declaredChoicesOf(feature).filter((r) => r.grant.kind === kind);
}

/**
 * Der Namenszusatz einer Frage-id. Die ERSTE Wahl ihrer Art bleibt ohne — jede heute
 * gespeicherte Antwort hängt an der suffixlosen id.
 */
export const choiceIdSuffix = (ordinal: number): string => (ordinal ? `_${ordinal + 1}` : '');

/** Der Merkmals-Teil jeder Frage-id: Key, sonst Name. */
export const featureIdPart = (f: DeclaredChoiceSource): string =>
  (f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

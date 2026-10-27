/**
 * Speziesmerkmale nach CHARAKTERstufe — das Gegenstück zu `featuresUpTo`/`featuresBetween`
 * der Klassen-Progression. Ein Trait ohne `gainedAt` gilt ab Stufe 1.
 */
export interface LeveledTrait {
  gainedAt?: number;
}

const gainedAtOf = (t: LeveledTrait): number => t.gainedAt ?? 1;

export function traitsUpTo<T extends LeveledTrait>(traits: readonly T[], charLevel: number): T[] {
  return traits.filter((t) => gainedAtOf(t) <= charLevel);
}

/** Halboffen `(from, to]`: was ein Aufstieg von `from` auf `to` neu bringt. */
export function traitsBetween<T extends LeveledTrait>(traits: readonly T[], from: number, to: number): T[] {
  return traits.filter((t) => gainedAtOf(t) > from && gainedAtOf(t) <= to);
}

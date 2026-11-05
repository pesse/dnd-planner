/**
 * Talente sind der einzige Träger, den ein Charakter MEHRFACH haben kann — dieses Modul hält die
 * Identität einer Vergabe fest, damit Antwort und Auswahl ihre Instanz wiederfinden.
 */
import { featSpecialisation, getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, matchFeatEntry, type FeatEntry } from '$lib/featsLibrary';
import type { CharacterBackground, CharacterFeatureEntry } from '$lib/schemas/characterSchema';
import type { DeclaringCharacter } from './carriers';

/**
 * Die Id EINER Instanz: derselbe Merkmals-Key kann zweimal vergeben sein (Eingeweihter der
 * Magie ×2), und nur über die Vergabe-Stufe findet die Auflösung ihre Antwort und ihre
 * gespeicherte Auswahl wieder. Die FRÜHESTE Vergabe behält den blanken Key — sonst hinge die
 * Zuordnung an der Reihenfolge der Ledger-Einträge.
 */
export const instanceIdOf = (featureKey: string, gainedAt: number, firstGainedAt: number): string =>
  gainedAt > firstGainedAt ? `${featureKey}@${gainedAt}` : featureKey;

/**
 * Die Id einer Instanz, die ein Merkmal NEBEN dem gleichen Talent des Hintergrunds vergibt
 * (Mensch-Akolyth mit Eingeweihter der Magie ×2) — die Vergabe-Stufe trennt die beiden nicht.
 */
export const grantedInstanceId = (featureKey: string, grantedBy: string): string => `${featureKey}@${grantedBy}`;

/** Eine Talent-Instanz am Charakter: Bibliothekseintrag, Vergabe-Stufe, Identität. */
export interface FeatInstance {
  entry: FeatEntry;
  /** Bibliotheks-Key des Talents = Merkmals-Key der Quelle. */
  featureKey: string;
  /** Vergabe-Stufe, UNGEKAPPT: sie ist Teil der Identität, kein Stufenfilter. */
  gainedAt: number;
  /** Quellen-Id samt Instanz (`instanceIdOf`). */
  sourceId: string;
  /** Vorgabe des Hintergrunds, nur am Herkunftstalent. */
  specialisation: string;
  /** Merkmal, das den Link vergeben hat (`characterFeatureSchema.grantedBy`). */
  grantedBy: string;
}

/**
 * Die Talent-Instanzen eines Charakters, DIE eine Regel: mehrere Ledger-Links desselben
 * Talents sind mehrere Instanzen (Eingeweihter der Magie ×2, „a different list each time"),
 * das Herkunftstalent kommt aus dem Hintergrund statt aus dem Ledger — und nur einmal.
 * Aufsteigend nach Vergabe-Stufe, bei Gleichstand das des Hintergrunds vorn: die erste
 * Instanz behält den blanken Key.
 */
export async function featInstances(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
): Promise<FeatInstance[]> {
  const links = (features ?? []).filter((e) => !e.choice.trim() && (e.sourceKey || e.name.trim()));
  const bg = background?.sourceKey ? await getBackgroundByKey(background.sourceKey) : null;
  const bgKey = bg?.featKey ?? '';
  const specialisation = featSpecialisation(bg);
  // Ein von Hand verlinktes Herkunftstalent IST das des Hintergrunds — ein von einem Merkmal
  // vergebenes ist ein zweites.
  const refs = [
    ...links.map((e) => ({ sourceKey: e.sourceKey, name: e.name, gainedAt: e.gainedAt ?? 1, grantedBy: e.grantedBy ?? '' })),
    ...(bgKey && !links.some((e) => e.sourceKey === bgKey && !e.grantedBy)
      ? [{ sourceKey: bgKey, name: '', gainedAt: 1, grantedBy: '' }]
      : []),
  ];
  if (!refs.length) return [];

  const lib = await getFeats();
  const resolved = refs
    .map((ref) => ({ ref, entry: matchFeatEntry(lib, ref) }))
    .filter((r): r is { ref: (typeof refs)[number]; entry: FeatEntry } => !!r.entry?.sourceKey)
    .sort((a, b) => a.ref.gainedAt - b.ref.gainedAt || Number(!!a.ref.grantedBy) - Number(!!b.ref.grantedBy));

  const firstGainedAt = new Map<string, number>();
  return resolved.map(({ ref, entry }) => {
    const featureKey = entry.sourceKey!;
    const first = firstGainedAt.get(featureKey);
    if (first === undefined) firstGainedAt.set(featureKey, ref.gainedAt);
    const sourceId =
      first === undefined ? featureKey
      : ref.gainedAt === first && ref.grantedBy ? grantedInstanceId(featureKey, ref.grantedBy)
      : instanceIdOf(featureKey, ref.gainedAt, first);
    return {
      entry,
      featureKey,
      gainedAt: ref.gainedAt,
      sourceId,
      specialisation: featureKey === bgKey && !ref.grantedBy ? specialisation : '',
      grantedBy: ref.grantedBy,
    };
  });
}

/**
 * Die Id, die eine JETZT vergebene Instanz bekommt — der Bestand entscheidet, ob sie die
 * erste ist. Der Aufstieg braucht sie, bevor der Charakter das Talent trägt.
 */
export async function nextFeatSourceId(
  c: DeclaringCharacter,
  featureKey: string,
  gainedAt: number,
): Promise<string> {
  const instances = await featInstances(c.features, c.backgroundRef);
  const earlier = instances.filter((i) => i.featureKey === featureKey).map((i) => i.gainedAt);
  return instanceIdOf(featureKey, gainedAt, Math.min(gainedAt, ...earlier));
}

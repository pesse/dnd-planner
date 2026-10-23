/**
 * Trefferpunkte als Würfelsumme plus Ableitung: TP-Maximum = Würfel + (KON-Mod + Boni je
 * Stufe) × Charakterstufe. Beide Boni gelten rückwirkend für alle Stufen.
 */
import { resolveClassFeatures, resolveFeatLinks, resolveSpeciesTraits } from './characterFeatures';
import { getProgressionByKey } from './classProgression';
import { hpPerLevelSources, hpPerLevelSum, type PerLevelFeature, type PerLevelSource } from './perLevelEffects';
import type { Character } from '../schemas/characterSchema';

export interface HpBasis {
  conMod: number;
  level: number;
  /** Summe der `grants.perLevel.hpMax` (`hpPerLevelSum`). */
  perLevel: number;
  /** Höchste Würfelsumme der Klassenstufen; fehlt, solange ein Trefferwürfel unbekannt ist. */
  maxDice?: number;
}

export const hpBonusTotal = (b: HpBasis): number => (b.conMod + b.perLevel) * b.level;

/** Gespeichert oder aus dem TP-Maximum zurückgerechnet; `null`, wenn das keine Zahl ist. */
export function hpDiceTotalOf(c: Pick<Character, 'hpMax' | 'hpDiceTotal'>, b: HpBasis): number | null {
  if (c.hpDiceTotal !== undefined) return c.hpDiceTotal;
  const max = c.hpMax.trim();
  if (!/^\d+$/.test(max)) return null;
  return Number(max) - hpBonusTotal(b);
}

/** Was kein Würfelergebnis sein kann, war ein von Hand gesetztes Maximum. */
export const plausibleDiceTotal = (total: number, b: HpBasis): boolean =>
  total >= b.level && total <= (b.maxDice ?? b.level * 12);

export interface OwnedGrantFeature extends PerLevelFeature {
  /** Anzeigesprache, wie `ResolvedFeature.desc`. */
  desc: string;
}

/** Die Merkmale, die der Charakter JETZT trägt: Volk, Klassen bis zur Stufe, Talent-Links. */
export async function ownedGrantFeatures(c: Pick<Character, 'species' | 'classes' | 'features'>): Promise<OwnedGrantFeature[]> {
  const groups = [
    ...((await resolveSpeciesTraits(c.species)) ?? []),
    ...(await resolveClassFeatures(c.classes)),
  ];
  // Nur die Talent-Links: Wahl-Annotationen bringen keinen eigenen Merkmalstext mit,
  // ihr Merkmal steckt schon in `groups`.
  const featLinks = await resolveFeatLinks((c.features ?? []).filter((f) => !f.choice?.trim()));
  return [...groups.flatMap((g) => g.features), ...featLinks].map((f) => ({ key: f.key ?? '', name: f.name, desc: f.desc, grants: f.grants }));
}

export async function ownedHpPerLevelSources(c: Pick<Character, 'species' | 'classes' | 'features'>): Promise<PerLevelSource[]> {
  return hpPerLevelSources(await ownedGrantFeatures(c));
}

export async function ownedHpPerLevel(c: Pick<Character, 'species' | 'classes' | 'features'>): Promise<number> {
  return hpPerLevelSum(await ownedHpPerLevelSources(c));
}

export async function maxDiceTotal(classes: Character['classes']): Promise<number | undefined> {
  let max = 0;
  for (const cls of classes) {
    const die = (await getProgressionByKey(cls.sourceKey))?.hitDie ?? 0;
    if (!die) return undefined;
    max += die * (cls.level || 1);
  }
  return max;
}

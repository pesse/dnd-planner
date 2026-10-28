/**
 * Trefferpunkte als Würfelsumme plus Ableitung: TP-Maximum = Würfel + (KON-Mod + Boni je
 * Stufe) × Charakterstufe. Beide Boni gelten rückwirkend für alle Stufen.
 */
import { resolveClassFeatures, resolveFeatLinks, resolveSpeciesTraits, type ResolvedFeature } from './characterFeatures';
import { chosenOption } from './declaration/optionList';
import { ledgerAnswers } from './declaration/ledgerAnswers';
import { getProgressionByKey } from './classProgression';
import { characterLevel } from './declaration/carriers';
import { hpPerLevelSources, hpPerLevelSum, type PerLevelFeature, type PerLevelSource } from './perLevelEffects';
import type { Character } from '../schemas/characterSchema';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';

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
  /** Klassenstufe bei Klassenmerkmalen, sonst Charakterstufe. */
  level: number;
}

export type OwnedLinks = Pick<Character, 'species' | 'classes' | 'features' | 'backgroundRef'>;

/** Die Merkmale, die der Charakter JETZT trägt: Volk, Klassen bis zur Stufe, Talent-Links, Herkunftstalent. */
export async function ownedGrantFeatures(c: OwnedLinks): Promise<OwnedGrantFeature[]> {
  const charLevel = characterLevel(c.classes);
  const groups = [
    ...((await resolveSpeciesTraits(c.species, charLevel)) ?? []),
    ...(await resolveClassFeatures(c.classes)),
  ];
  // Nur die Talent-Links: Wahl-Annotationen bringen keinen eigenen Merkmalstext mit,
  // ihr Merkmal steckt schon in `groups`.
  const links = (c.features ?? []).filter((f) => !f.choice?.trim());
  const originKey = c.backgroundRef?.sourceKey ? (await getBackgroundByKey(c.backgroundRef.sourceKey))?.featKey : '';
  // Älterer Bestand führt das Herkunftstalent zusätzlich als Link — doppelt zählte es zweimal.
  if (originKey && !links.some((f) => f.sourceKey === originKey)) links.push({ sourceKey: originKey, name: '', choice: '', choiceDe: '', choiceId: '', desc: '' });
  const featLinks = await resolveFeatLinks(links);
  const owned = [
    ...groups.flatMap((g) => g.features.map((f) => ({ f, level: g.level ?? charLevel }))),
    ...featLinks.map((f) => ({ f, level: charLevel })),
  ];
  return [
    ...owned.map(({ f, level }) => ({ key: f.key ?? '', name: f.name, desc: f.desc, grants: f.grants, level })),
    ...chosenOptionGrants(owned, c.features ?? []),
  ];
}

/**
 * Was die gewählte Option gewährt, steht neben der Option statt am Merkmal (Drachenabstammung →
 * Resistenz). Der Rider schreibt davon nur Übungen und Sprachen in die Datei; was zur Laufzeit
 * wirkt, fehlte sonst.
 */
function chosenOptionGrants(
  features: readonly { f: ResolvedFeature; level: number }[],
  ledger: Character['features'],
): OwnedGrantFeature[] {
  const out: OwnedGrantFeature[] = [];
  for (const { f, level } of features) {
    if (!f.key || !f.grantsChoice?.length) continue;
    for (const answer of ledgerAnswers(ledger, f.key)) {
      const option = chosenOption(f, answer);
      const key = `${f.key}:${option?.value}`;
      if (!option?.grants || out.some((o) => o.key === key)) continue;
      out.push({ key, name: `${f.name} (${option.labelDe || option.value})`, desc: '', grants: option.grants, level });
    }
  }
  return out;
}

export async function ownedHpPerLevelSources(c: OwnedLinks): Promise<PerLevelSource[]> {
  return hpPerLevelSources(await ownedGrantFeatures(c));
}

export async function ownedHpPerLevel(c: OwnedLinks): Promise<number> {
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

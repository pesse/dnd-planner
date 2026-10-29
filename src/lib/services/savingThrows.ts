/**
 * Rettungswürfe als Posten wie die RK-Herleitung: Mod, Übung und deklarierte Zuschläge aus
 * angelegten Gegenständen, Merkmalen und den eigenen Auren.
 */
import { ABILITY_ABBR_DE, ABILITY_KEYS, abilityRecordOf, type AbilityKey, type AbilityScores } from '../schemas/abilities';
import type { Character } from '../schemas/characterSchema';
import type { FeatureGrant } from '../schemas/grants';
import type { SaveBonusValue, SavingThrowEffect } from '../schemas/savingThrow';
import { situationalLabelDe } from '../schemas/situationalBonus';
import { buildItemIndex, displayName, getAllItemsByDir } from '../itemLibrary';
import { featureIdOf } from '../utils/text';
import { sign } from '../utils/num';
import type { CharacterAura } from './auras';
import type { DerivationRow } from './hitPointDerivation';
import { ownedGrantFeatures, type OwnedGrantFeature, type OwnedLinks } from './hitPoints';
import { resolveAmount } from './resources/amount';
import { idleItemsIn, wornItemsIn, type IdleItem, type WornItem } from './wornItems';

export interface SavingThrowSource {
  labelDe: string;
  effect: SavingThrowEffect;
}

export interface SavingThrowFeature {
  key?: string;
  name: string;
  grants?: FeatureGrant;
}

export interface SavingThrowDerivation {
  rows: DerivationRow[];
  total: number;
  notes: string[];
}

export function resolveSaveBonus(value: SaveBonusValue, mods: AbilityScores, profBonus: number): number {
  return resolveAmount(value, { level: 0, profBonus, mods, column: () => undefined });
}

export function savingThrowSources(
  worn: readonly WornItem[],
  features: readonly SavingThrowFeature[],
  auras: readonly CharacterAura[],
): SavingThrowSource[] {
  const fromItems = worn.flatMap(({ item }) =>
    (item.savingThrowEffects ?? []).map((effect) => ({ labelDe: displayName(item), effect })));
  const seen = new Set<string>();
  const fromFeatures: SavingThrowSource[] = [];
  for (const f of features) {
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    fromFeatures.push(...(f.grants?.savingThrow ?? []).map((effect) => ({ labelDe: f.name, effect })));
  }
  const fromAuras = auras.flatMap((a): SavingThrowSource[] => a.saveBonus === undefined ? [] : [{
    labelDe: a.nameDe,
    effect: { kind: 'bonus', value: a.saveBonus, abilities: [] },
  }]);
  return [...fromItems, ...fromFeatures, ...fromAuras];
}

const isDeathSave = (e: SavingThrowEffect): boolean => e.kind === 'advantage' && !!e.deathSave;

const applies = (e: SavingThrowEffect, key: AbilityKey): boolean =>
  !isDeathSave(e) && (!e.abilities.length || e.abilities.includes(key));

/** Die Quellen, die Vorteil auf Todesrettungswürfe geben; leer = keiner. */
export const deathSaveAdvantage = (sources: readonly SavingThrowSource[]): string[] =>
  sources.filter((s) => isDeathSave(s.effect)).map((s) => s.labelDe);

function noteOf(labelDe: string, e: SavingThrowEffect): string | null {
  if (e.kind === 'situational') return `${labelDe} ${sign(e.value)}: ${situationalLabelDe(e)}`;
  if (e.kind === 'advantage') {
    const when = e.conditionDe?.trim() || e.condition?.trim();
    return `Vorteil (${labelDe})${when ? `: ${when}` : ''}`;
  }
  return null;
}

function derivation(
  key: AbilityKey,
  input: { mods: AbilityScores; profBonus: number; proficient: boolean; sources: readonly SavingThrowSource[] },
): SavingThrowDerivation {
  const rows: DerivationRow[] = [{ labelDe: `${ABILITY_ABBR_DE[key]}-Mod`, value: input.mods[key], notes: [] }];
  if (input.proficient) rows.push({ labelDe: 'Übungsbonus', value: input.profBonus, notes: [] });
  const notes: string[] = [];
  for (const { labelDe, effect } of input.sources) {
    if (!applies(effect, key)) continue;
    if (effect.kind === 'bonus')
      rows.push({ labelDe, value: resolveSaveBonus(effect.value, input.mods, input.profBonus), notes: [] });
    else notes.push(noteOf(labelDe, effect)!);
  }
  return { rows, total: rows.reduce((n, r) => n + r.value, 0), notes };
}

export function savingThrowDerivations(input: {
  /** Wirksame Mods (`effectiveMods`). */
  mods: AbilityScores;
  profBonus: number;
  saveProfs: Character['saveProfs'];
  sources: readonly SavingThrowSource[];
  /** Fehlt, wo der Aufrufer das Inventar nicht kennt. */
  idle?: readonly IdleItem[];
}): Record<AbilityKey, SavingThrowDerivation> {
  const out = abilityRecordOf((k) => derivation(k, { ...input, proficient: input.saveProfs[k] }));
  const idleNotes = (input.idle ?? [])
    .filter(({ item }) => item.savingThrowEffects?.length)
    .map(({ item, reason }) => `${displayName(item)}: ${reason === 'unequipped' ? 'nicht angelegt' : 'nicht eingestimmt'}`);
  for (const k of ABILITY_KEYS) out[k].notes.push(...idleNotes);
  return out;
}

/** Für Aufrufer ohne reaktive Bibliotheken (Druck). */
export async function loadSavingThrowInputs(
  c: OwnedLinks & Pick<Character, 'inventory'>,
): Promise<{ worn: WornItem[]; idle: IdleItem[]; features: OwnedGrantFeature[] }> {
  const [index, features] = await Promise.all([getAllItemsByDir().then(buildItemIndex), ownedGrantFeatures(c)]);
  return { worn: wornItemsIn(index, c.inventory ?? []), idle: idleItemsIn(index, c.inventory ?? []), features };
}

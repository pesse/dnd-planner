/**
 * Deklarierter Options-Pool (`grantsChoice.kind === 'optionPool'`): Metamagie heute, die
 * Anrufungen des Hexenmeisters ohne zweiten Mechanismus. Reines ANGEBOT wie `weaponMastery.ts`
 * — Kontingent plus Optionsliste, KEIN KI-Pfad: ein Modell könnte hier nur Optionen erfinden.
 */
import type { ChoiceOption } from '../../schemas/featureChoice';
import type { OptionPick } from '../../schemas/characterSchema';
import type { ClassFeature, ClassProgression } from '../../schemas/classProgression';
import { featuresUpTo, columnValue, getProgressionByKey } from '../classProgression';
import { declaredChoicesOfKind, type DeclaredChoiceRef, type DeclaredChoiceSource } from './source';

/** Ohne Optionen gibt es nichts anzubieten — die Deklaration ist dann unvollständig. */
export const isOptionPoolRef = (r: DeclaredChoiceRef): boolean =>
  r.grant.kind === 'optionPool' && r.grant.options.length > 0;

export const optionPoolRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'optionPool').filter(isOptionPoolRef);

export const isOptionPoolFeature = (f: DeclaredChoiceSource): boolean => optionPoolRefs(f).length > 0;

/**
 * Kumulativ über die erreichten Vergabe-Stufen (Metamagie: 2 / 4 / 6 auf 2 / 10 / 17). Führt
 * die Klassentabelle eine Spalte, gilt SIE — dort steht die Zahl schon summiert.
 */
export function poolAllowanceFor(
  prog: ClassProgression,
  feature: ClassFeature,
  grant: { count: number; column: string },
  level: number,
): number {
  if (grant.column.trim()) {
    const raw = columnValue(prog, grant.column.trim(), level);
    return Number(String(raw ?? '').match(/(\d+)/)?.[1] ?? 0);
  }
  return feature.gainedAt.filter((l) => l <= level).length * grant.count;
}

export interface OptionPoolOffer {
  /** Merkmals-Key = Schlüssel der Senke am Charakter (`optionPicks[].sourceKey`). */
  featureKey: string;
  titleDe: string;
  className: string;
  /** 0 = das Merkmal ist auf dieser Stufe noch nicht vergeben. */
  allowance: number;
  options: ChoiceOption[];
}

/** Ein `Character` erfüllt das strukturell (wie bei `MasteryInput`). */
export interface OptionPoolInput {
  classes?: { sourceKey?: string; subclassKey?: string; name?: string; level?: number }[];
}

function offersOf(prog: ClassProgression, className: string, level: number): OptionPoolOffer[] {
  const out: OptionPoolOffer[] = [];
  for (const feature of featuresUpTo(prog, level))
    for (const r of optionPoolRefs(feature)) {
      const allowance = poolAllowanceFor(prog, feature, r.grant, level);
      if (allowance <= 0 || !feature.key) continue;
      out.push({
        featureKey: feature.key,
        titleDe: feature.nameDe || feature.name,
        className,
        allowance,
        options: r.grant.options,
      });
    }
  return out;
}

/**
 * ANDERS als bei der Waffenbeherrschung zählt nicht nur `classes[0]`: jeder Pool hängt an
 * seinem eigenen Merkmal, also bringt eine zweite Klasse ihren eigenen mit. Subklassen
 * inklusive — eine Homebrew-Subklasse darf einen Pool erweitern.
 */
export async function optionPoolOffers(input: OptionPoolInput): Promise<OptionPoolOffer[]> {
  const classes = input.classes?.filter((c) => c?.sourceKey) ?? [];
  const out: OptionPoolOffer[] = [];
  for (const c of classes) {
    const level = Math.min(20, Math.max(1, c.level ?? 1));
    const [prog, subProg] = await Promise.all([
      getProgressionByKey(c.sourceKey!),
      c.subclassKey ? getProgressionByKey(c.subclassKey) : Promise.resolve(null),
    ]);
    if (!prog) continue;
    const className = c.name?.trim() || prog.nameDe || prog.name;
    out.push(...offersOf(prog, className, level));
    if (subProg) out.push(...offersOf(subProg, className, level));
  }
  return out;
}

export const poolPicks = (picks: readonly OptionPick[], featureKey: string): OptionPick[] =>
  picks.filter((p) => p.sourceKey === featureKey);

/**
 * Am Maximum BLOCKIEREN statt die älteste Wahl herauszuschieben — der Tausch soll bewusst
 * sein. Zurückzunehmen ist dabei nichts: eine Pool-Option gewährt keine Mechanik, die am
 * Bogen stünde.
 */
export function toggleOptionPick(
  picks: readonly OptionPick[],
  offer: OptionPoolOffer,
  option: ChoiceOption,
): OptionPick[] {
  const mine = poolPicks(picks, offer.featureKey);
  if (mine.some((p) => p.value === option.value))
    return picks.filter((p) => p.sourceKey !== offer.featureKey || p.value !== option.value);
  if (mine.length >= offer.allowance) return [...picks];
  return [
    ...picks,
    { sourceKey: offer.featureKey, value: option.value, valueDe: option.labelDe || option.value },
  ];
}

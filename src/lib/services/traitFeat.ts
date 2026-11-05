/**
 * Talentwahl aus einem Speziesmerkmal (Vielseitig: „ein Herkunftstalent deiner Wahl"). Bauform
 * wie `fightingStyle.ts`; gespeichert wird ein Talent-LINK in `character.features[]`.
 */
import type { FeatCategory } from '$lib/schemas/vocabulary';
import { getFeats, type FeatEntry } from '$lib/featsLibrary';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { choiceGrants, type DeclaredChoiceSource } from './declaration/source';
import { FIGHTING_STYLE_CATEGORY, featCategoryOptions, pickableFeats, type FightingStyleOption } from './fightingStyle';

export interface TraitFeatOffer {
  featureKey: string;
  /** Anzeigename des Merkmals. */
  label: string;
  featCategory: FeatCategory;
  allowance: number;
  /** ALLE Talente der Kategorie — auch die schon vorhandenen, damit ihr Fehlen erklärt ist. */
  options: FightingStyleOption[];
  recommended: string[];
  /** Talente, die der Charakter schon hat; wählbar nur, wenn `repeatable` (`pickableFeats`). */
  owned: string[];
  /** Woher `owned` stammt, als Satzteil: „über deinen Hintergrund „Adliger“". */
  ownedVia: string;
}

type TraitLike = DeclaredChoiceSource & { key?: string; name?: string; nameDe?: string };

export function traitFeatOffers(
  traits: readonly TraitLike[],
  feats: readonly FeatEntry[],
  owned: readonly string[],
  ownedVia = '',
): TraitFeatOffer[] {
  return traits.flatMap((t) =>
    choiceGrants(t)
      .filter((g) => g.kind === 'featCategory' && g.featCategory && g.featCategory !== FIGHTING_STYLE_CATEGORY)
      .map((g) => ({
        featureKey: t.key ?? '',
        label: t.nameDe || t.name || '',
        featCategory: g.featCategory!,
        allowance: g.count,
        options: featCategoryOptions(feats, g.featCategory!),
        recommended: g.recommended,
        owned: [...owned],
        ownedVia,
      })),
  );
}

/** Wie viele Talente das Angebot tatsächlich zulässt — die Bibliothek kann weniger führen. */
export const traitFeatQuota = (offer: TraitFeatOffer): number =>
  Math.min(offer.allowance, pickableFeats(offer.options, offer.owned).length);

export async function loadTraitFeatOffers(speciesKey: string, backgroundKey: string): Promise<TraitFeatOffer[]> {
  if (!speciesKey) return [];
  const [spec, bg, feats] = await Promise.all([
    getSpeciesByKey(speciesKey),
    backgroundKey ? getBackgroundByKey(backgroundKey) : Promise.resolve(null),
    getFeats(),
  ]);
  const via = bg ? `über deinen Hintergrund „${bg.nameDe || bg.name}“` : '';
  return traitFeatOffers(spec?.traits ?? [], feats, bg?.featKey ? [bg.featKey] : [], via);
}

export interface TraitFeatStatus {
  pickable: boolean;
  /** Sichtbare Begründung, leer bei einem gewöhnlichen Talent. */
  note: string;
}

export function traitFeatStatus(offer: TraitFeatOffer, option: FightingStyleOption): TraitFeatStatus {
  if (!offer.owned.includes(option.sourceKey)) return { pickable: true, note: '' };
  const via = offer.ownedVia ? ` ${offer.ownedVia}` : '';
  return option.repeatable
    ? { pickable: true, note: `Hast du schon${via} — wiederholbar, du darfst es ein zweites Mal nehmen.` }
    : { pickable: false, note: `Hast du schon${via} — nicht wiederholbar, deshalb nicht wählbar.` };
}

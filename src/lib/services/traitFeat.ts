/**
 * Talentwahl aus einem Speziesmerkmal (Vielseitig: „ein Herkunftstalent deiner Wahl"). Bauform
 * wie `fightingStyle.ts`; gespeichert wird ein Talent-LINK in `character.features[]`.
 */
import type { FeatCategory } from '$lib/schemas/vocabulary';
import { getFeats, type FeatEntry } from '$lib/featsLibrary';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { choiceGrants, type DeclaredChoiceSource } from './declaration/source';
import { FIGHTING_STYLE_CATEGORY, featCategoryOptions, type FightingStyleOption } from './fightingStyle';

export interface TraitFeatOffer {
  featureKey: string;
  /** Anzeigename des Merkmals. */
  label: string;
  featCategory: FeatCategory;
  allowance: number;
  options: FightingStyleOption[];
  recommended: string[];
}

type TraitLike = DeclaredChoiceSource & { key?: string; name?: string; nameDe?: string };

/**
 * `exclude` sind Talente, die der Charakter schon hat (das des Hintergrunds) — auch ein
 * wiederholbares: beide Instanzen stünden auf Stufe 1 und teilten sich die Id (`instanceIdOf`).
 */
export function traitFeatOffers(traits: readonly TraitLike[], feats: readonly FeatEntry[], exclude: readonly string[]): TraitFeatOffer[] {
  return traits.flatMap((t) =>
    choiceGrants(t)
      .filter((g) => g.kind === 'featCategory' && g.featCategory && g.featCategory !== FIGHTING_STYLE_CATEGORY)
      .map((g) => ({
        featureKey: t.key ?? '',
        label: t.nameDe || t.name || '',
        featCategory: g.featCategory!,
        allowance: g.count,
        options: featCategoryOptions(feats, g.featCategory!).filter((o) => !exclude.includes(o.sourceKey)),
        recommended: g.recommended,
      })),
  );
}

export async function loadTraitFeatOffers(speciesKey: string, backgroundKey: string): Promise<TraitFeatOffer[]> {
  if (!speciesKey) return [];
  const [spec, bg, feats] = await Promise.all([
    getSpeciesByKey(speciesKey),
    backgroundKey ? getBackgroundByKey(backgroundKey) : Promise.resolve(null),
    getFeats(),
  ]);
  return traitFeatOffers(spec?.traits ?? [], feats, bg?.featKey ? [bg.featKey] : []);
}

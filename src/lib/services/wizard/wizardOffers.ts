/**
 * Die Angebote der Wizard-Schritte aus dem Wizard-Zustand. Schritte und Zufallsfüllung fragen
 * hier, damit beide dieselbe Auswahl sehen. Die Eingaben entstehen synchron: ein `$effect`,
 * der das aufruft, hängt so an genau den Feldern, die das Angebot bestimmen.
 */
import { masteryOffer, type MasteryOffer } from '../weaponMastery';
import { fightingStyleOffer, type FightingStyleOffer } from '../fightingStyle';
import { loadTraitFeatOffers, type TraitFeatOffer } from '../traitFeat';
import { optionPoolOffers, type OptionPoolOffer } from '../declaration/optionPool';
import type { CollectedGrants } from '../proficiencyGrants';
import type { CharacterWizard } from './characterWizard.svelte';
import { featureLedger } from './castingDraft';

const classRef = (w: CharacterWizard) => ({
  sourceKey: w.klass.sourceKey,
  subclassKey: w.klass.subclassKey,
  name: w.klass.name,
  level: 1,
});

export const weaponProfsOf = (grants: CollectedGrants | null) => ({
  simpleWeapons: grants?.weapons.some((g) => g.value === 'Simple') ?? false,
  martialWeapons: grants?.weapons.some((g) => g.value === 'Martial') ?? false,
});

export const wizardMasteryOffer = (w: CharacterWizard): Promise<MasteryOffer> =>
  masteryOffer({ classes: [classRef(w)], proficiencies: weaponProfsOf(w.grants) });

/** Nach den Merkmalen: eine Talentwahl mit `when` hängt an deren Antwort. */
export const wizardFightingStyleOffer = (w: CharacterWizard): Promise<FightingStyleOffer> =>
  fightingStyleOffer({ classes: [classRef(w)], features: featureLedger(w), optionPicks: optionPicksCopy(w) });

export const wizardTraitFeatOffers = (w: CharacterWizard): Promise<TraitFeatOffer[]> =>
  loadTraitFeatOffers(w.species.sourceKey, w.background.sourceKey);

export const wizardOptionPools = (w: CharacterWizard): Promise<OptionPoolOffer[]> =>
  optionPoolOffers({ classes: [classRef(w)] });

/** Ein Proxy-freier Abzug: das Angebot läuft async weiter, während der Wizard sich ändert. */
function optionPicksCopy(w: CharacterWizard) {
  return w.optionPicks.map((p) => ({ ...p }));
}

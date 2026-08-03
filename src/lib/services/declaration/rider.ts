/** Rider-Gerüst eines deklarierten Merkmals: alles leer bis auf die Identität. */
import type { FeatureRider } from '../../schemas/levelUp';
import type { FeatureSource } from '../declaredFeature';

/**
 * `sheetNote` und `decisions` bleiben leer, beides bewusst: die Bogen-Zeile kommt aus
 * `optionListNoteLines`, das Protokoll aus `featureChoiceChanges`. Ein Eintrag hier wäre
 * jeweils die zweite Ausfertigung.
 */
export function emptyRider(f: { key?: string; name: string; source?: FeatureSource }): FeatureRider {
  return {
    featureName: f.name,
    featureKey: f.key ?? '',
    // Aus dem Merkmal, nicht pauschal 'class' — der Default machte die Fehletikettierung
    // eines Talent-Riders unsichtbar.
    source: f.source ?? 'class',
    grantedSpells: [],
    extraCantrips: 0,
    extraPreparedCount: 0,
    expertiseSkills: [],
    proficiencies: { skills: [], tools: [], weapons: [], armor: [], languages: [], savingThrows: [] },
    abilityScoreIncrease: { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
    decisions: [],
    sheetNote: '',
  };
}

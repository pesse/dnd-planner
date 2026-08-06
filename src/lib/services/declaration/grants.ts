/**
 * Das unbedingte `grants` am Merkmal selbst — die einzige der drei Deklarationen, die das
 * Merkmal NICHT aus dem Notiz-Eingang nimmt: es trägt weiter Prosa, die eine Bogenzeile
 * verdient.
 */
import type { Change, FeatureRider } from '../../schemas/levelUp';
import { isEmptyProficiencyGrant, type FeatureGrant } from '../../schemas/grants';
import { proficiencyGrantChanges } from '../proficiencyGrants';
import { characterPropertyChanges, isEmptyCharacterProperties } from '../characterProperties';
import type { FeatureSource } from '../declaredFeature';
import { featureIdOf } from '$lib/utils/text';
import { emptyRider } from './rider';

/**
 * Was eine Deklaration gewährt, das der Rider nicht ausdrücken kann — heute die
 * EINGESCHRÄNKTE Waffen-Übung und die Grundeigenschaften. Alles Übrige reist über
 * `withGrant`; daher die Ausschlussliste, sonst wirkte das Feld deklarierbar, aber folgenlos.
 */
export function declaredGrantChanges(
  features: readonly DeclaredGrantSource[],
  meta: { step: string; source: string },
): Change[] {
  const out: Change[] = [];
  // Dasselbe Merkmal erreicht den Aufstieg aus mehreren Richtungen — ohne Guard doppelt.
  const seen = new Set<string>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = { ...meta, source: f.key || meta.source };
    out.push(
      ...proficiencyGrantChanges(f.grants.proficiencies, source, ['skills', 'savingThrows', 'weapons', 'armor']),
      // Nicht in der Ausschlussliste: Eigenschaften reisen nie über den Rider.
      ...characterPropertyChanges(f.grants.properties, source),
    );
  }
  return out;
}

/**
 * Über `keyof FeatureGrant` total, weil das Ergebnis in `declaredGrantChanges` filtert: ein
 * neues Feld, das hier fehlte, ließe ein Merkmal, dessen einzige Mechanik es ist, komplett
 * ausfallen — noch bevor die geprüften Senken es zu sehen bekämen.
 */
export function isEmptyFeatureGrant(g: FeatureGrant): boolean {
  const filled: { [K in keyof FeatureGrant]: () => boolean } = {
    proficiencies: () => !isEmptyProficiencyGrant(g.proficiencies),
    languages: () => g.languages.length > 0,
    extraCantrips: () => g.extraCantrips > 0,
    extraPreparedCount: () => g.extraPreparedCount > 0,
    perLevel: () => g.perLevel.hpMax !== 0,
    properties: () => !isEmptyCharacterProperties(g.properties),
  };
  return !Object.values(filled).some((has) => has());
}

/** Klassenmerkmal, Trait und Talent erfüllen das strukturell. */
export interface DeclaredGrantSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  grants?: FeatureGrant;
}

/**
 * Die Aufzählung in `withGrant` ist von Hand und ignorierte ein neues Feld STILL. Diese
 * Tabelle ist über `keyof` total und bricht dann den Build.
 */
const GRANT_SINKS: { [K in keyof FeatureGrant]: 'rider' | 'change' | 'perLevel' } = {
  proficiencies: 'rider', // `weaponsOther` daraus zusätzlich als Change
  languages: 'rider',
  extraCantrips: 'rider',
  extraPreparedCount: 'rider',
  perLevel: 'perLevel',
  properties: 'change',
};
void GRANT_SINKS;

/**
 * GENAU die Felder, die `featureGrantSchema` ausdrücken kann; alles Übrige des Riders bleibt
 * stehen, weil die Deklaration darüber nichts sagt. `perLevel` fehlt absichtlich — es wirkt
 * je Charakterstufe über `hpPerLevelSources`.
 */
export function withGrant(rider: FeatureRider, grants: FeatureGrant): FeatureRider {
  const p = grants.proficiencies;
  return {
    ...rider,
    extraCantrips: grants.extraCantrips,
    extraPreparedCount: grants.extraPreparedCount,
    proficiencies: {
      ...rider.proficiencies,
      skills: [...p.skills.fixed],
      weapons: [...p.weapons],
      armor: [...p.armor],
      savingThrows: [...p.savingThrows],
      languages: [...grants.languages],
    },
  };
}

/** Ein Rider je Merkmal mit gefülltem `grants` — `{}` heißt „geprüft, gewährt nichts". */
export function declaredGrantRiders(features: readonly DeclaredGrantSource[]): FeatureRider[] {
  const out: FeatureRider[] = [];
  // Dasselbe Merkmal erreicht den Flow aus mehreren Richtungen — ohne Guard doppelt.
  const seen = new Set<string>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(withGrant(emptyRider(f), f.grants));
  }
  return out;
}

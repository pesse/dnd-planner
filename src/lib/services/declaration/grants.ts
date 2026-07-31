/**
 * Das unbedingte `grants` am Merkmal selbst — die einzige der drei Deklarationen, die das
 * Merkmal NICHT aus dem KI-Eingang nimmt: es trägt weiter Prosa, für die Pass C eine
 * `sheetNote` schreiben soll. Also sieht das Modell dasselbe Merkmal und liefert einen
 * eigenen Rider — ohne Auflösung zählte ein deklariertes `extraCantrips` zweimal.
 */
import type { Change, FeatureRider } from '../../schemas/levelUp';
import { isEmptyProficiencyGrant, type FeatureGrant } from '../../schemas/grants';
import { proficiencyGrantChanges } from '../proficiencyGrants';
import { characterPropertyChanges, isEmptyCharacterProperties } from '../characterProperties';
import type { FeatureSource } from '../declaredFeature';
import { featureIdOf } from '$lib/utils/text';
import { emptyRider } from './rider';

/**
 * Was eine Deklaration gewährt, das der Rider nicht ausdrücken kann — heute nur die
 * EINGESCHRÄNKTE Waffen-Übung („Martial weapons that have the Light property"): Freitext,
 * für den es im geschlossenen Rider-Vokabular kein Feld gibt und geben soll (Pass C nennt
 * sie ausdrücklich Text, nicht Grant).
 *
 * Alles Übrige reist über `withGrant` in den Rider und von dort über `riderGrantChanges`;
 * deshalb die Ausschlussliste. Ohne diese Funktion wäre `grants.proficiencies.weaponsOther`
 * deklarierbar, aber im Aufstieg wirkungslos — dieselbe stille Lücke wie zuvor bei den
 * Waffen- und Rüstungsübungen.
 */
export function declaredGrantChanges(
  features: readonly DeclaredGrantSource[],
  meta: { step: string; source: string },
): Change[] {
  const out: Change[] = [];
  // Dasselbe Merkmal erreicht den Aufstieg aus mehreren Richtungen (Delta und nachgeladene
  // Subklassen-Merkmale) — sonst stünde seine Zeile zweimal im Protokoll.
  const seen = new Set<string>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = { ...meta, source: f.key || meta.source };
    out.push(
      ...proficiencyGrantChanges(f.grants.proficiencies, source, ['skills', 'savingThrows', 'weapons', 'armor']),
      // Grundeigenschaften stehen NICHT in der Ausschlussliste: sie reisen nie über den
      // Rider, dieser Weg ist ihr einziger.
      ...characterPropertyChanges(f.grants.properties, source),
    );
  }
  return out;
}

/** Ob eine Deklaration überhaupt etwas gewährt (sonst braucht sie keinen Rider). */
export function isEmptyFeatureGrant(g: FeatureGrant): boolean {
  const p = g.proficiencies;
  return (
    !g.extraCantrips &&
    !g.extraPreparedCount &&
    !g.perLevel.hpMax &&
    !p.skills.fixed.length &&
    !p.skills.choose &&
    !p.savingThrows.length &&
    !p.weapons.length &&
    !p.weaponsOther.length &&
    !p.armor.length &&
    isEmptyCharacterProperties(g.properties)
  );
}

// Die einzige der drei Deklarationen, die das Merkmal NICHT aus dem KI-Eingang nimmt: es trägt
// weiter Prosa, für die Pass C eine `sheetNote` schreiben soll (Stufe 5 ist offen). Also sieht
// das Modell dasselbe Merkmal und liefert dafür einen eigenen Rider — ohne Auflösung zählte ein
// deklariertes `extraCantrips` zweimal.

/** Ein Merkmal mit unbedingter Deklaration — Klassenmerkmal, Trait und Talent erfüllen es. */
export interface DeclaredGrantSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  grants?: FeatureGrant;
}

/**
 * Wohin jedes Feld von `FeatureGrant` fließt — die Aufzählung in `withGrant` ist von Hand und
 * würde ein neues Feld STILL ignorieren. Diese Tabelle ist über `keyof` total und bricht dann
 * den Build; dieselbe Absicherung wie bei `proficiencyGrantChanges`/`riderGrantChanges`.
 *
 *   `rider`    → über `withGrant` in den `FeatureRider` und von dort in `riderGrantChanges`
 *   `change`   → direkt als `Change` (`declaredGrantChanges`), weil der Rider das
 *                Ausgabevokabular des Modells ist und die Wirkung darin nichts zu suchen hat
 *   `perLevel` → je Charakterstufe, über `hpPerLevelSources`
 */
const GRANT_SINKS: { [K in keyof FeatureGrant]: 'rider' | 'change' | 'perLevel' } = {
  proficiencies: 'rider', // `weaponsOther` daraus zusätzlich als Change
  extraCantrips: 'rider',
  extraPreparedCount: 'rider',
  perLevel: 'perLevel',
  properties: 'change',
};
void GRANT_SINKS;

/**
 * Trägt eine Deklaration in einen Rider ein — und zwar GENAU die Felder, die
 * `featureGrantSchema` ausdrücken kann. Alles Übrige des Riders bleibt stehen, weil die
 * Deklaration darüber nichts sagt: `grantedSpells` gehört `grantsSpells`, `expertiseSkills`
 * gehört `grantsChoice.kind === 'expertise'`, `abilityScoreIncrease` ist bewusst nicht im
 * Schema (Korrektur 2 des Plans) und `tools`/`languages` sind kein geschlossenes Vokabular.
 * `perLevel` fehlt hier absichtlich: es wirkt je Charakterstufe und läuft über
 * `hpPerLevelSources`, nicht über den Rider.
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
    },
  };
}

/**
 * **Die Deklaration gewinnt.** Für jedes Merkmal mit nicht-leerem `grants` werden die
 * deklarierten Werte in seinen Rider geschrieben; existiert keiner, entsteht einer. Damit ist
 * `grants` erstmals auch dann wirksam, wenn das Merkmal aus dem KI-Eingang fiel, die Deutung
 * übersprungen wurde (kein QM-Modell) oder sie das Merkmal übersah.
 *
 * Als Code-Regel an EINER Stelle statt als Prompt-Regel: das Modell kann die Deklaration gar
 * nicht sehen — `buildFeatureEffectsInput` projiziert nur die Prosa-Felder.
 *
 * `grants: {}` heißt „geprüft, gewährt nichts" (`isEmptyFeatureGrant`) — dann gibt es nichts zu
 * ersetzen und der KI-Rider bleibt unangetastet. Fehlt das Feld ganz, ist das Merkmal nicht
 * redigiert und die KI behält das letzte Wort.
 *
 * Gematcht über `featureKey`, ersatzweise über den englischen Namen — dieselbe Kette, mit der
 * Pass C seine Rider an die Merkmale bindet.
 */
export function withDeclaredGrants(riders: FeatureRider[], features: DeclaredGrantSource[]): FeatureRider[] {
  const byKey = new Map<string, DeclaredGrantSource>();
  const byName = new Map<string, DeclaredGrantSource>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    // Erster Treffer gewinnt: dasselbe Merkmal erreicht den Flow aus mehreren Richtungen
    // (Delta und nachgeladene Subklassen-Merkmale), ein zweiter Rider wäre die Dublette.
    const key = f.key?.trim();
    if (key && !byKey.has(key)) byKey.set(key, f);
    const name = f.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, f);
  }
  if (!byKey.size && !byName.size) return riders;

  const applied = new Set<DeclaredGrantSource>();
  const out = riders.map((r) => {
    const key = r.featureKey.trim();
    const f = (key ? byKey.get(key) : undefined) ?? byName.get(r.featureName.trim().toLowerCase());
    if (!f?.grants) return r;
    applied.add(f);
    return withGrant(r, f.grants);
  });
  for (const f of new Set([...byKey.values(), ...byName.values()]))
    if (!applied.has(f)) out.push(withGrant(emptyRider(f), f.grants!));
  return out;
}

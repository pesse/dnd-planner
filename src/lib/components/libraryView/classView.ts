/** Anzeige-Projektion einer Klassen-Progression — Bibliothekskarte und Wizard lesen dieselbe. */
import type { ClassProgression, ClassFeature } from '$lib/types';
import type { ClassOverview } from '$lib/schemas/classProgression';
import { ABILITY_LABEL_BY_NAME } from '$lib/schemas/abilities';
import {
  abilityLabelDe, skillLabelDe, skillGrantSummary, ARMOR_LABEL_DE, WEAPON_LABEL_DE,
} from '$lib/services/proficiencyGrants';
import type { FeatureListEntry } from '../FeatureList.svelte';

export const CASTER_LABELS: Record<string, string> = {
  NONE: 'Kein Zauberwirker', FULL: 'Voller Zauberwirker', HALF: 'Halber Zauberwirker',
  THIRD: 'Drittel-Zauberwirker', PACT: 'Paktmagie',
};

export const COMPLEXITY_LABELS: Record<ClassOverview['complexity'], string> = {
  low: 'Einfach', medium: 'Mittel', high: 'Anspruchsvoll',
};

export interface CoreRow { label: string; value: string }

export function primaryAbilityText(o: ClassOverview): string {
  return o.primaryAbilities.map((a) => ABILITY_LABEL_BY_NAME[a]).join(o.primaryJoin === 'and' ? ' und ' : ' oder ');
}

export function classCoreRows(klass: ClassProgression): CoreRow[] {
  const g = klass.proficiencyGrant;
  if (!g) return [];
  const weapons = [...g.weapons.map((w) => WEAPON_LABEL_DE[w]), ...g.weaponsOther];
  const choice = g.skills.choose > 0 ? g.skills.from.map((s) => skillLabelDe(s)).join(', ') : '';
  return [
    { label: 'Rettungswürfe', value: g.savingThrows.map(abilityLabelDe).join(', ') },
    { label: 'Fertigkeiten', value: skillGrantSummary(g.skills) },
    { label: 'Zur Wahl', value: choice },
    { label: 'Waffen', value: weapons.join(', ') },
    { label: 'Rüstung', value: g.armor.map((a) => ARMOR_LABEL_DE[a]).join(', ') },
    { label: 'Bei Klassenkombination', value: skillGrantSummary(klass.skillGrantMulticlass) },
  ].filter((r) => r.value);
}

export function classFeatureEntries(features: readonly ClassFeature[], note?: string): FeatureListEntry[] {
  return features.map((f, i) => ({
    id: f.key || `${f.name}-${i}`,
    name: f.nameDe || f.name,
    text: f.descDe || f.desc,
    level: f.gainedAt[0],
    note: [f.gainedAt.length > 1 ? `Stufe ${f.gainedAt.join(', ')}` : '', note ?? ''].filter(Boolean).join(' · ') || undefined,
  }));
}

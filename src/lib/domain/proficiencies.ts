/**
 * Die acht Übungsfelder des Bogens als EINE über `keyof ProficiencyFlags` totale Tabelle
 * aus Bogen-Feld und Vokabular-Wert. Ein neues Feld am Schema bricht damit den Build,
 * statt still ohne Anzeige und Grant-Abgleich zu bleiben.
 */
import type { ProficiencyFlags } from '$lib/schemas/characterSchema';
import type { ArmorTraining, WeaponCategory } from '$lib/schemas/vocabulary';

/**
 * Die deutschen Anzeigenamen der beiden geschlossenen Vokabulare — hier, damit `domain/`
 * für sein eigenes Label nicht auf `services/` zeigen muss.
 */
export const WEAPON_LABEL_DE: Record<WeaponCategory, string> = {
  Simple: 'Einfache Waffen',
  Martial: 'Kriegswaffen',
};

export const ARMOR_LABEL_DE: Record<ArmorTraining, string> = {
  Light: 'Leichte Rüstung',
  Medium: 'Mittelschwere Rüstung',
  Heavy: 'Schwere Rüstung',
  Shields: 'Schilde',
};

/**
 * `flag` ist ein Häkchen auf einen Vokabular-Wert, `list` die einzeln erklärten Waffen,
 * `prose` der Freitext ohne mechanische Wirkung.
 */
export type ProficiencyDef =
  | { form: 'flag'; kind: 'weapons'; value: WeaponCategory }
  | { form: 'flag'; kind: 'armor'; value: ArmorTraining }
  | { form: 'list' }
  | { form: 'prose' };

export type ProficiencyFlagDef = Extract<ProficiencyDef, { form: 'flag' }>;

export const PROFICIENCY_DEFS = {
  simpleWeapons:     { form: 'flag', kind: 'weapons', value: 'Simple' },
  martialWeapons:    { form: 'flag', kind: 'weapons', value: 'Martial' },
  individualWeapons: { form: 'list' },
  otherWeapons:      { form: 'prose' },
  lightArmor:        { form: 'flag', kind: 'armor',   value: 'Light' },
  mediumArmor:       { form: 'flag', kind: 'armor',   value: 'Medium' },
  heavyArmor:        { form: 'flag', kind: 'armor',   value: 'Heavy' },
  shields:           { form: 'flag', kind: 'armor',   value: 'Shields' },
} as const satisfies { [K in keyof ProficiencyFlags]: ProficiencyDef };

/** Die Häkchen-Felder, aus der Tabelle abgeleitet statt von Hand ausgeschlossen. */
export type ProficiencyFlagField = {
  [K in keyof typeof PROFICIENCY_DEFS]: (typeof PROFICIENCY_DEFS)[K]['form'] extends 'flag' ? K : never;
}[keyof typeof PROFICIENCY_DEFS];

const WIDENED: Record<keyof ProficiencyFlags, ProficiencyDef> = PROFICIENCY_DEFS;

/** Reihenfolge des Bogens: erst die beiden Waffenkategorien, dann die vier Rüstungsstufen. */
export const PROFICIENCY_FLAGS = Object.entries(WIDENED).flatMap(([field, def]) =>
  def.form === 'flag' ? [{ field: field as ProficiencyFlagField, def }] : [],
);

export const proficiencyLabel = (def: ProficiencyFlagDef): string =>
  def.kind === 'weapons' ? WEAPON_LABEL_DE[def.value] : ARMOR_LABEL_DE[def.value];

const setFlagLabels = (pf: ProficiencyFlags, kind: 'weapons' | 'armor'): string[] =>
  PROFICIENCY_FLAGS.filter((f) => f.def.kind === kind && pf[f.field]).map((f) => proficiencyLabel(f.def));

/**
 * Kategorien, dann die einzeln erklärten Waffen. `withProse` hängt den Freitext an: Protokoll,
 * KI-Kontext und Druckbogen führen ihn in derselben Aufzählung, der Bogen zeigt ihn getrennt.
 */
export function weaponProficiencyLabels(
  pf: ProficiencyFlags,
  { withProse = false }: { withProse?: boolean } = {},
): string[] {
  const prose = withProse ? pf.otherWeapons.trim() : '';
  return [...setFlagLabels(pf, 'weapons'), ...pf.individualWeapons, ...(prose ? [prose] : [])];
}

export const armorProficiencyLabels = (pf: ProficiencyFlags): string[] => setFlagLabels(pf, 'armor');

export const hasAnyProficiency = (pf: ProficiencyFlags): boolean =>
  weaponProficiencyLabels(pf, { withProse: true }).length > 0 || armorProficiencyLabels(pf).length > 0;

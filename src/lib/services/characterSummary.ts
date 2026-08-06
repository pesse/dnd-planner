/**
 * Die EINE Projektion „Charakter → gruppierte Wertelisten". Sie liefert nur Werte, keine
 * Überschriften und keine Zeilen: das Protokoll zeigt die Fertigkeit nackt, der KI-Kontext
 * mit Wert — dieselbe Liste, zwei Formatierungen.
 */
import type { Character } from '$lib/schemas/characterSchema';
import { ABILITY_KEYS, ABILITY_LABEL } from '$lib/schemas/abilities';
import { SKILL_DEFS } from '$lib/domain/skills';
import { armorProficiencyLabels, weaponProficiencyLabels } from '$lib/domain/proficiencies';
import { sign } from '$lib/utils/num';

export type SummarySectionId =
  | 'abilities' | 'coreValues' | 'skills' | 'expertise' | 'savingThrows'
  | 'weapons' | 'armor' | 'masteries' | 'optionPicks' | 'tools' | 'languages';

export interface SummaryValue {
  /** Deutsch wie auf dem Bogen: „Stärke", „Akrobatik", „Einfache Waffen". */
  label: string;
  /** Bogen-Kurzform, wo es eine gibt: „STR". */
  short?: string;
  /** Die Zahl VOR der Klammer — heute nur der Attributswert. */
  score?: number;
  /** Der Wert selbst: „+2", „+5", „30", „1W10". */
  detail?: string;
  /** Was in der Klammer dahinter steht: „Expertise", „Rettungswurf geübt". */
  note?: string;
}

export interface SummarySection {
  id: SummarySectionId;
  values: SummaryValue[];
}

type SkillRow = Character['skills'][string] | undefined;

const plain = (values: readonly string[]): SummaryValue[] => values.map((label) => ({ label }));

const abilities = (c: Character): SummaryValue[] =>
  ABILITY_KEYS.map((k) => ({
    label: ABILITY_LABEL[k],
    short: k.toUpperCase(),
    score: c.abilities[k],
    detail: sign(c.mods[k]),
    note: c.saveProfs[k] ? 'Rettungswurf geübt' : undefined,
  }));

/** Ein leeres Bogenfeld liefert keinen Eintrag; der Übungsbonus steht immer. */
function coreValues(c: Character): SummaryValue[] {
  const rows: SummaryValue[] = [
    { label: 'Trefferpunkte', detail: c.hpMax },
    { label: 'Trefferwürfel', detail: c.hitDice },
    { label: 'Bewegungsrate', detail: c.speed },
    { label: 'Übungsbonus', detail: sign(c.proficiencyBonus) },
  ];
  return rows.filter((v) => v.detail?.trim());
}

const skills = (c: Character, take: (row: SkillRow) => boolean): SummaryValue[] =>
  SKILL_DEFS.filter((d) => take(c.skills[d.key])).map((d) => ({
    label: d.label,
    detail: sign(c.skills[d.key]?.value ?? 0),
    note: c.skills[d.key]?.exp ? 'Expertise' : undefined,
  }));

/**
 * `skills` und `expertise` sind disjunkt, `abilities` trägt die Rettungswurf-Übung zusätzlich
 * als `note`: wer eine Zeile je Fertigkeit/Attribut will, hängt die Sektionen aneinander.
 */
export function characterSummary(c: Character): SummarySection[] {
  const pf = c.proficiencies;
  return [
    { id: 'abilities', values: abilities(c) },
    { id: 'coreValues', values: coreValues(c) },
    { id: 'skills', values: skills(c, (row) => !!row?.prof && !row?.exp) },
    { id: 'expertise', values: skills(c, (row) => !!row?.exp) },
    {
      id: 'savingThrows',
      values: plain(ABILITY_KEYS.filter((k) => c.saveProfs[k]).map((k) => ABILITY_LABEL[k])),
    },
    { id: 'weapons', values: plain(weaponProficiencyLabels(pf, { withProse: true })) },
    { id: 'armor', values: plain(armorProficiencyLabels(pf)) },
    { id: 'masteries', values: plain(c.masteries) },
    // `valueDe` ist das Zitat aus der Deklaration; ohne es bliebe nur das englische Label.
    { id: 'optionPicks', values: plain((c.optionPicks ?? []).map((p) => p.valueDe || p.value)) },
    { id: 'tools', values: plain(c.tools) },
    { id: 'languages', values: plain(c.languages) },
  ];
}

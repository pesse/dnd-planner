/**
 * Die Herleitung des TP-Maximums als Posten: Würfel, KON × Stufe, Boni je Stufe. Daten, kein
 * Markup — Editor und Bogen zeigen dieselben Zeilen (`characterSheetTips.hpTip`).
 */
import type { Character } from '../schemas/characterSchema';
import { mod } from '../domain/skills';
import { sign } from '../utils/num';
import type { AbilityResolution, AbilityStep } from './effectiveAbilities';
import { hpDiceTotalOf, plausibleDiceTotal, type HpBasis } from './hitPoints';
import type { PerLevelSource } from './perLevelEffects';

/** `notes` erklären den Posten darüber, je eine Zeile. */
export interface DerivationRow {
  labelDe: string;
  value: number;
  notes: string[];
}

export interface HpDerivation {
  /** Die erste Zeile sind die Würfel, sofern bekannt — sie tragen kein Vorzeichen. */
  rows: DerivationRow[];
  diceKnown: boolean;
  /** Summe der Posten; null, solange die Würfelsumme unbekannt ist. */
  total: number | null;
  /** Das eingetragene Maximum; null, wo keine Zahl steht. */
  stored: number | null;
  notes: string[];
}

/** Je Gegenstand, der das Attribut betrifft, eine Zeile. */
export const abilityStepNotes = (abbrDe: string, r: AbilityResolution): string[] =>
  r.steps.map((s: AbilityStep) =>
    !s.applied ? `${s.labelDe}: wirkungslos`
    : s.kind === 'set' ? `${s.labelDe}: ${abbrDe} ${s.value}`
    : `${s.labelDe}: ${sign(s.value)}`);

const conNotes = (r: AbilityResolution): string[] => [
  ...abilityStepNotes('KON', r),
  ...(r.score !== r.base ? [`ohne Gegenstände: ${sign(mod(r.base))}`] : []),
];

export function hpDerivation(
  c: Pick<Character, 'hpMax' | 'hpDiceTotal'>,
  basis: HpBasis,
  con: AbilityResolution,
  sources: readonly PerLevelSource[],
): HpDerivation {
  const raw = c.hpMax.trim();
  const stored = /^\d+$/.test(raw) ? Number(raw) : null;
  const level = basis.level;
  const bonusRows: DerivationRow[] = [
    { labelDe: `KON ${sign(basis.conMod)} × Stufe ${level}`, value: basis.conMod * level, notes: conNotes(con) },
    ...sources.map((s) => ({ labelDe: `${s.feature} ${sign(s.amount)} × Stufe ${level}`, value: s.amount * level, notes: [] })),
  ];

  const dice = hpDiceTotalOf(c, basis);
  const diceKnown = dice !== null && (c.hpDiceTotal !== undefined || plausibleDiceTotal(dice, basis));
  const notes: string[] = [];
  if (stored === null && c.hpDiceTotal === undefined) notes.push('kein TP-Maximum eingetragen');
  else if (!diceKnown && dice !== null) notes.push(`Würfelsumme ${dice} unmöglich (höchstens ${basis.maxDice ?? level * 12})`);

  if (!diceKnown || dice === null) return { rows: bonusRows, diceKnown: false, total: null, stored, notes };
  const diceRow: DerivationRow = {
    labelDe: 'Trefferwürfel',
    value: dice,
    notes: c.hpDiceTotal === undefined ? ['zurückgerechnet aus dem TP-Maximum'] : [],
  };
  const rows = [diceRow, ...bonusRows];
  return { rows, diceKnown: true, total: rows.reduce((n, r) => n + r.value, 0), stored, notes };
}

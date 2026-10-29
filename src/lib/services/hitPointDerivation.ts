/**
 * Die Herleitung des TP-Maximums als Posten: Würfel, KON × Stufe, Boni je Stufe. Daten, kein
 * Markup — Editor und Bogen zeigen dieselben Zeilen (`characterSheetTips.hpTip`).
 */
import type { CombatAdjustment } from '../schemas/combatAdjustment';
import { mod } from '../domain/skills';
import { sign } from '../utils/num';
import type { AbilityResolution, AbilityStep } from './effectiveAbilities';
import { hpDiceTotalOf, knownDiceTotal, type HpBasis, type HpInput } from './hitPoints';
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

export const adjustmentRows = (list: readonly CombatAdjustment[] | undefined): DerivationRow[] =>
  (list ?? []).map((a) => ({ labelDe: a.reason.trim() || 'Anpassung', value: a.amount, notes: [] }));

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
  c: HpInput,
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
    ...adjustmentRows(c.combatAdjustments?.hpMax),
  ];

  const dice = knownDiceTotal(c, basis);
  const notes: string[] = [];
  const guessed = hpDiceTotalOf(c, basis);
  if (guessed === null) notes.push('keine Würfelsumme eingetragen');
  else if (dice === null) notes.push(`Würfelsumme ${guessed} unmöglich (höchstens ${basis.maxDice ?? level * 12})`);

  if (dice === null) return { rows: bonusRows, diceKnown: false, total: null, stored, notes };
  const diceRow: DerivationRow = {
    labelDe: 'Trefferwürfel',
    value: dice,
    notes: c.hpDiceTotal === undefined ? ['zurückgerechnet aus dem TP-Maximum'] : [],
  };
  const rows = [diceRow, ...bonusRows];
  return { rows, diceKnown: true, total: rows.reduce((n, r) => n + r.value, 0), stored, notes };
}

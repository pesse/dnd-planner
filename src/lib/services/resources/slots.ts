/**
 * Das Maximum eines Platz-Vorrats: aus der Klassentabelle, über mehrere Klassen zusammengeführt.
 * Die Mehrklassen-Tabelle steht in keiner Klassentabelle — sie ist Code, wie `skillGrantMulticlass`.
 */
import type { ClassProgression } from '$lib/schemas/classProgression';
import type { SlotSource } from '$lib/schemas/resource';
import { firstInt, numOr } from '$lib/utils/num';
import { columnValueIn, levelTables } from '../classProgression';

/** v2 `caster_type` → Teiler der Zauberwirkerstufe. Wer hier fehlt, trägt nichts bei. */
const CASTER_DIVISOR: Record<string, number> = { FULL: 1, HALF: 2, THIRD: 3 };

const MULTICLASS_SLOTS: readonly (readonly number[])[] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Die zwei Pool-Namen, die der Zauberpfad kennt; jeder weitere ist Homebrew und wird deklariert. */
export const SLOT_POOL = 'standard';
export const PACT_POOL = 'pact';

/** Index 0 = Grad 1 … 8 = Grad 9. */
export const NINE = (row: readonly number[] = []): number[] =>
  Array.from({ length: 9 }, (_, i) => row[i] ?? 0);

export const divisorOf = (casterType: string): number =>
  CASTER_DIVISOR[casterType.trim().toUpperCase()] ?? 0;

/** Beitrag EINER Klasse: halbe bzw. gedrittelte Stufe, abgerundet — ein Paladin 1 trägt 0 bei. */
export function casterLevelOf(c: { level: number; casterType: string }): number {
  const div = divisorOf(c.casterType);
  return div ? Math.floor(Math.max(0, c.level) / div) : 0;
}

/** Eine Klasse, die einen Platz-Vorrat speist — mit der Schreibweise, die ihre Tabelle führt. */
export interface SlotFeeder {
  prog: ClassProgression;
  /** Ein Drittel-Zauberwirker führt die Platzspalten nur in der Subklassentabelle. */
  sub?: ClassProgression | null;
  level: number;
  casterType: string;
  levels: SlotSource;
}

/** Die neun Grade AUS der Klassentabelle, in der deklarierten Schreibweise. */
export function slotsFromTable(tables: readonly ClassProgression[], level: number, src: SlotSource): number[] {
  const col = (name: string): string | undefined => columnValueIn(tables, name, level);
  if ('columns' in src) return NINE(src.columns.map((c) => numOr(col(c))));
  const count = numOr(col(src.countColumn));
  const grade = firstInt(col(src.levelColumn));
  return NINE(Array.from({ length: grade }, (_, i) => (i === grade - 1 && grade <= 9 ? count : 0)));
}

/**
 * `caster-level` ist die SRD-Mehrklassenregel, `highest` die der Paktmagie („die höchste Stufe
 * gewinnt, addiert wird nicht"). Genau EINE speisende Klasse liest immer ihre eigene Tabelle:
 * die Mehrklassen-Tabelle gäbe dem Paladin 2 drei Plätze, seine eigene sagt zwei.
 */
export function combineSlots(feeders: SlotFeeder[], combine: 'caster-level' | 'highest'): number[] {
  const own = (f: SlotFeeder): number[] => slotsFromTable(levelTables(f.prog, f.sub), f.level, f.levels);
  if (combine === 'highest') {
    const top = [...feeders].sort((a, b) => b.level - a.level)[0];
    return top ? own(top) : NINE();
  }
  if (!feeders.length) return NINE();
  if (feeders.length === 1) return own(feeders[0]);
  const level = casterLevel(feeders);
  return level > 0 ? NINE(MULTICLASS_SLOTS[Math.min(20, level) - 1]) : NINE();
}

/** Die kombinierte Zauberwirkerstufe, die `caster-level` zugrunde legt. */
export function casterLevel(feeders: { level: number; casterType: string }[]): number {
  return feeders.reduce((n, f) => n + casterLevelOf(f), 0);
}

/**
 * Grade, für die ein Pool Plätze hergibt. Der Pakt-Pool führt nur seinen höchsten, und mit
 * dem wirkt der Hexenmeister auch jeden niedrigeren Grad.
 */
export function slotLevels(slots: number[]): number[] {
  let max = 0;
  for (let i = 0; i < slots.length; i++) if ((slots[i] ?? 0) > 0) max = i + 1;
  return Array.from({ length: max }, (_, i) => i + 1);
}

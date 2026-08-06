/**
 * Zauberplätze: EIN Standard-Pool über alle Klassen, der Pakt-Pool daneben.
 */
import type { ClassProgression } from '$lib/schemas/classProgression';
import { spellSlotsAt } from '../classProgression';

/** v2 `caster_type`. PACT speist den zweiten Pool, NONE keinen. */
const CASTER_DIVISOR: Record<string, number> = { FULL: 1, HALF: 2, THIRD: 3 };

export interface CastingClass {
  prog: ClassProgression;
  level: number;
  /** Aus der Klasse — bei Drittel-Zauberwirkern aus der SUBklasse (Arkaner Ritter). */
  casterType: string;
}

export interface SpellPools {
  /** Index 0 = Grad 1. */
  standard: number[];
  pact: number[];
  /** Kombinierte Zauberwirkerstufe des Standard-Pools. */
  casterLevel: number;
}

/**
 * Die SRD-Tabelle „Multiclass Spellcaster"; sie steht in keiner Klassentabelle. Gilt erst ab
 * zwei speisenden Klassen — allein liest ein Paladin 2 seine eigene Tabelle: zwei Plätze, nicht drei.
 */
const MULTICLASS_SLOTS: readonly (readonly number[])[] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const NINE = (row: readonly number[] = []): number[] =>
  Array.from({ length: 9 }, (_, i) => row[i] ?? 0);

const divisorOf = (casterType: string): number => CASTER_DIVISOR[casterType.trim().toUpperCase()] ?? 0;

/** Beitrag EINER Klasse: halbe bzw. gedrittelte Stufe, abgerundet — ein Paladin 1 trägt 0 bei. */
export function casterLevelOf(c: CastingClass): number {
  const div = divisorOf(c.casterType);
  return div ? Math.floor(Math.max(0, c.level) / div) : 0;
}

export function spellPools(classes: CastingClass[]): SpellPools {
  const feeding = classes.filter((c) => divisorOf(c.casterType) > 0 && c.level > 0);
  const casterLevel = feeding.reduce((n, c) => n + casterLevelOf(c), 0);
  const standard =
    feeding.length === 1
      ? spellSlotsAt(feeding[0].prog, feeding[0].level)
      : NINE(MULTICLASS_SLOTS[Math.min(20, casterLevel) - 1]);

  // Mehrere Pakt-Klassen (Homebrew): die höchste Stufe gewinnt, addiert wird nicht.
  const pactClass = classes
    .filter((c) => c.casterType.trim().toUpperCase() === 'PACT' && c.level > 0)
    .sort((a, b) => b.level - a.level)[0];

  return {
    standard: feeding.length ? standard : NINE(),
    pact: pactClass ? spellSlotsAt(pactClass.prog, pactClass.level) : NINE(),
    casterLevel,
  };
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

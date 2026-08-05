/**
 * Platz-Pools: kombinierte Zauberwirkerstufe, eigene Tabelle bei EINER speisenden Klasse,
 * Pakt-Pool daneben.
 *
 *   npm run test -- castingSlots
 */
import { describe, expect, it } from 'vitest';
import { classProgressionSchema, type ClassProgression } from '../../src/lib/schemas/classProgression';
import { casterLevelOf, slotLevels, spellPools, type CastingClass } from '../../src/lib/services/spellcasting/slots';

/** Nur die Spalten, die `spellSlotsAt` liest — der Rest kommt aus den Schema-Vorgaben. */
const prog = (key: string, casterType: string, levels: Record<number, Record<string, string>>): ClassProgression =>
  classProgressionSchema.parse({
    key,
    name: key,
    source: 'srd-2024',
    casterType,
    levels: Object.entries(levels).map(([level, columns]) => ({ level: Number(level), columns })),
  });

const PALADIN = prog('srd-2024_paladin', 'HALF', {
  1: { '1st': '2' },
  2: { '1st': '2' },
  6: { '1st': '4', '2nd': '2' },
});
const WIZARD = prog('srd-2024_wizard', 'FULL', {
  3: { '1st': '4', '2nd': '2' },
  5: { '1st': '4', '2nd': '3', '3rd': '2' },
});
const WARLOCK = prog('srd-2024_warlock', 'PACT', {
  5: { 'Spell Slots': '2', 'Slot Level': '3rd' },
});
const FIGHTER = prog('srd-2024_fighter', 'NONE', { 5: {} });

const cls = (p: ClassProgression, level: number, casterType = p.casterType): CastingClass => ({ prog: p, level, casterType });

describe('Zauberplätze', () => {
  it('liest bei EINER speisenden Klasse deren eigene Tabelle', () => {
    // Die Multiclass-Tabelle gäbe dem Paladin 2 drei Plätze — seine eigene sagt zwei.
    expect(spellPools([cls(PALADIN, 2)]).standard.slice(0, 2)).toEqual([2, 0]);
    expect(spellPools([cls(WIZARD, 5)]).standard.slice(0, 4)).toEqual([4, 3, 2, 0]);
  });

  it('kombiniert im Multiclass zu einer Zauberwirkerstufe', () => {
    const pools = spellPools([cls(WIZARD, 3), cls(PALADIN, 6)]);
    expect(pools.casterLevel).toBe(6); // 3 (voll) + 3 (halb, abgerundet)
    expect(pools.standard.slice(0, 4)).toEqual([4, 3, 3, 0]);
  });

  it('rundet den Beitrag jeder Klasse einzeln ab', () => {
    expect(casterLevelOf(cls(PALADIN, 1))).toBe(0);
    expect(casterLevelOf(cls(PALADIN, 5))).toBe(2);
    expect(casterLevelOf(cls(FIGHTER, 20))).toBe(0);
    // Zwei Halbe der Stufe 1 ergeben zusammen Stufe 0.
    expect(spellPools([cls(PALADIN, 1), cls(PALADIN, 1)]).standard).toEqual(Array(9).fill(0));
  });

  it('führt den Pakt-Pool getrennt und ohne Beitrag zur Zauberwirkerstufe', () => {
    const pools = spellPools([cls(WARLOCK, 5), cls(WIZARD, 3)]);
    expect(pools.casterLevel).toBe(3);
    expect(pools.standard.slice(0, 3)).toEqual([4, 2, 0]);
    expect(pools.pact.slice(0, 4)).toEqual([0, 0, 2, 0]);
    // Ein Hexenmeister allein speist den Standard-Pool nicht.
    expect(spellPools([cls(WARLOCK, 5)]).standard).toEqual(Array(9).fill(0));
  });

  it('nimmt beim Pakt-Pool jeden Grad bis zum höchsten als wirkbar', () => {
    expect(slotLevels(spellPools([cls(WARLOCK, 5)]).pact)).toEqual([1, 2, 3]);
    expect(slotLevels(spellPools([cls(WIZARD, 5)]).standard)).toEqual([1, 2, 3]);
    expect(slotLevels(Array(9).fill(0))).toEqual([]);
  });

  it('erkennt Drittel-Zauberwirker an der Subklasse', () => {
    // Der Arkane Ritter deklariert an der SUBklasse; die Tabelle bleibt die des Kämpfers.
    const pools = spellPools([cls(FIGHTER, 9, 'THIRD'), cls(WIZARD, 3)]);
    expect(pools.casterLevel).toBe(6);
  });
});

/**
 * Die Zusammenführungsregeln der Platz-Vorräte: kombinierte Zauberwirkerstufe, eigene Tabelle
 * bei EINER speisenden Klasse, `highest` für die Paktmagie.
 *
 *   npm run test -- castingSlots
 */
import { describe, expect, it } from 'vitest';
import { classProgressionSchema, type ClassProgression } from '../../src/lib/schemas/classProgression';
import type { SlotSource } from '../../src/lib/schemas/resource';
import {
  casterLevel,
  casterLevelOf,
  combineSlots,
  slotLevels,
  type SlotFeeder,
} from '../../src/lib/services/resources/slots';

/** Die zwei Schreibweisen, die der Vault deklariert. */
const GRADES: SlotSource = { columns: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'] };
const PACT_TABLE: SlotSource = { countColumn: 'Spell Slots', levelColumn: 'Slot Level' };

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

const feeder = (
  p: ClassProgression,
  level: number,
  levels: SlotSource = GRADES,
  casterType = p.casterType,
): SlotFeeder => ({ prog: p, level, casterType, levels });

const standard = (...feeders: SlotFeeder[]): number[] => combineSlots(feeders, 'caster-level');

describe('Zauberplätze', () => {
  it('liest bei EINER speisenden Klasse deren eigene Tabelle', () => {
    // Die Multiclass-Tabelle gäbe dem Paladin 2 drei Plätze — seine eigene sagt zwei.
    expect(standard(feeder(PALADIN, 2)).slice(0, 2)).toEqual([2, 0]);
    expect(standard(feeder(WIZARD, 5)).slice(0, 4)).toEqual([4, 3, 2, 0]);
  });

  it('kombiniert im Multiclass zu einer Zauberwirkerstufe', () => {
    const feeders = [feeder(WIZARD, 3), feeder(PALADIN, 6)];
    expect(casterLevel(feeders)).toBe(6); // 3 (voll) + 3 (halb, abgerundet)
    expect(combineSlots(feeders, 'caster-level').slice(0, 4)).toEqual([4, 3, 3, 0]);
  });

  it('rundet den Beitrag jeder Klasse einzeln ab', () => {
    expect(casterLevelOf(feeder(PALADIN, 1))).toBe(0);
    expect(casterLevelOf(feeder(PALADIN, 5))).toBe(2);
    expect(casterLevelOf(feeder(FIGHTER, 20))).toBe(0);
    // Zwei Halbe der Stufe 1 ergeben zusammen Stufe 0.
    expect(standard(feeder(PALADIN, 1), feeder(PALADIN, 1))).toEqual(Array(9).fill(0));
  });

  it('nimmt beim Pakt-Pool die höchste Stufe statt zu addieren', () => {
    const pact = combineSlots([feeder(WARLOCK, 5, PACT_TABLE)], 'highest');
    expect(pact.slice(0, 4)).toEqual([0, 0, 2, 0]);
    // Ein Hexenmeister trägt nichts zur Zauberwirkerstufe bei: PACT hat keinen Teiler.
    expect(casterLevel([feeder(WARLOCK, 5, PACT_TABLE)])).toBe(0);
  });

  it('nimmt beim Pakt-Pool jeden Grad bis zum höchsten als wirkbar', () => {
    expect(slotLevels(combineSlots([feeder(WARLOCK, 5, PACT_TABLE)], 'highest'))).toEqual([1, 2, 3]);
    expect(slotLevels(standard(feeder(WIZARD, 5)))).toEqual([1, 2, 3]);
    expect(slotLevels(Array(9).fill(0))).toEqual([]);
  });

  it('erkennt Drittel-Zauberwirker an der Subklasse', () => {
    // Der Arkane Ritter deklariert an der SUBklasse; die Tabelle bleibt die des Kämpfers.
    expect(casterLevel([feeder(FIGHTER, 9, GRADES, 'THIRD'), feeder(WIZARD, 3)])).toBe(6);
  });
});

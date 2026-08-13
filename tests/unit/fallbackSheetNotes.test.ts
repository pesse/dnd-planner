/**
 * Die Ersatzfassung der Bogen-Notizen, wenn der Notiz-Call nicht laufen konnte: sie muss
 * jedes Merkmal auf den Bogen bringen und das Zeichenbudget des PDF-Felds halten.
 */
import { describe, expect, it } from 'vitest';
import { fallbackSheetNotes } from '../../src/lib/services/levelUp/sheetNotes';
import { SHEET_NOTE_MAX_CHARS } from '../../src/lib/schemas/levelUp';
import type { GainedFeature } from '../../src/lib/services/analysis/types';

const feature = (over: Partial<GainedFeature> = {}): GainedFeature => ({
  name: 'Second Wind',
  nameDe: 'Zweiter Wind',
  desc: 'You have a limited well of physical and mental stamina. On your turn you can use a Bonus Action to regain Hit Points.',
  descDe: 'Du verfügst über einen begrenzten Vorrat an Ausdauer. Als Bonusaktion kannst du 1W10 + Kämpferstufe Trefferpunkte zurückgewinnen. Du kannst dies zweimal einsetzen.',
  source: 'class',
  key: 'srd-2024_fighter_second-wind',
  gainedAt: 1,
  ...over,
});

describe('fallbackSheetNotes', () => {
  it('nimmt den deutschen Namen und den ersten Satz der deutschen Prosa', () => {
    const [note] = fallbackSheetNotes([feature()]);
    expect(note.sheetNote).toBe('Zweiter Wind: Du verfügst über einen begrenzten Vorrat an Ausdauer.');
    expect(note.featureKey).toBe('srd-2024_fighter_second-wind');
    expect(note.featureName).toBe('Second Wind');
  });

  it('fällt ohne deutsche Prosa auf den englischen Text zurück', () => {
    const [note] = fallbackSheetNotes([feature({ descDe: undefined })]);
    expect(note.sheetNote).toBe('Zweiter Wind: You have a limited well of physical and mental stamina.');
  });

  it('hält das Zeichenbudget und schneidet an der Wortgrenze', () => {
    const long = `Er wirkt ${'sehr '.repeat(60)}lange und ohne Punkt`;
    const [note] = fallbackSheetNotes([feature({ descDe: long })]);
    expect(note.sheetNote.length).toBeLessThanOrEqual(SHEET_NOTE_MAX_CHARS);
    expect(note.sheetNote.endsWith('…')).toBe(true);
    expect(note.sheetNote).not.toMatch(/\s…$/);
  });

  it('trägt den Namen allein, wenn kein Merkmalstext vorliegt', () => {
    const [note] = fallbackSheetNotes([feature({ desc: '', descDe: '' })]);
    expect(note.sheetNote).toBe('Zweiter Wind');
  });

  it('führt ein Merkmal, das der Eingang doppelt enthält, nur einmal', () => {
    expect(fallbackSheetNotes([feature(), feature()])).toHaveLength(1);
  });

  it('lässt ein Merkmal ohne Namen weg — eine leere Bogenzeile hilft niemandem', () => {
    expect(fallbackSheetNotes([feature({ name: '', nameDe: '' })])).toEqual([]);
  });
});

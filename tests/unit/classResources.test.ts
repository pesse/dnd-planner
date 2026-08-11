/**
 * Die Klassifikation der Klassentabellen-Spalten: skalierender Wert oder nicht auf dem Bogen.
 * Ohne Vault und ohne LLM — die Spalten kommen als rohes Record herein.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_RESOURCE_COLUMNS, valueTracks } from '../../src/lib/domain/classResources';

const byColumn = (columns: Record<string, string>): Record<string, { label: string; text: string }> =>
  Object.fromEntries(valueTracks(columns).map((t) => [t.column, t]));

describe('Werte aus der Klassentabelle', () => {
  it('druckt einen Würfelwert in Bogen-Schreibweise', () => {
    // Der Bogen ist deutsch: die Tabelle liefert `2d6`, gedruckt wird `2W6`.
    expect(byColumn({ 'Sneak Attack': '2d6' })['Sneak Attack']).toMatchObject({
      label: 'Hinterhältiger Angriff',
      text: '2W6',
    });
  });

  it('lässt weg, was schon anderswo auf dem Bogen steht', () => {
    const t = byColumn({
      '1st': '4', '5th': '2', Cantrips: '3', 'Cantrips Known': '3', 'Prepared Spells': '9',
      'Proficiency Bonus': '+3', 'Weapon Mastery': '3', 'Eldritch Invocations': '5',
      'Spell Slots': '2', 'Slot Level': '3',
    });

    expect(t).toEqual({});
  });

  it('lässt die Zähler-Spalten den Vorräten', () => {
    expect(byColumn({ Rages: '3', 'Wild Shape': '2', 'Sorcery Points': '5' })).toEqual({});
  });

  it('übergeht eine unbekannte Spalte, statt zu werfen', () => {
    expect(() => valueTracks({ 'Homebrew Punkte': '4' })).not.toThrow();
    expect(byColumn({ 'Homebrew Punkte': '4', 'Bardic Die': '1d8' })).toHaveProperty('Bardic Die');
  });

  it('wertet Leerzeichen und Gedankenstrich als „gibt es auf dieser Stufe nicht"', () => {
    expect(byColumn({ 'Rage Damage': '', 'Sneak Attack': '—', 'Martial Arts': '-' })).toEqual({});
  });

  it('hält die Reihenfolge der Tabelle, nicht die des Eingangs', () => {
    const order = valueTracks({ 'Sneak Attack': '2d6', 'Rage Damage': '+2' }).map((t) => t.column);
    const expected = Object.keys(CLASS_RESOURCE_COLUMNS).filter((c) => order.includes(c));

    expect(order).toEqual(expected);
  });
});

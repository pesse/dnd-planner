/**
 * Die Klassifikation der Klassentabellen-Spalten: Zähler, skalierender Wert oder gar nichts.
 * Ohne Vault und ohne LLM — die Spalten kommen als rohes Record herein.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_RESOURCE_COLUMNS, resourceTracks } from '../../src/lib/domain/classResources';

const byColumn = (columns: Record<string, string>) =>
  Object.fromEntries(resourceTracks(columns).map((t) => [t.column, t]));

describe('Ressourcen aus der Klassentabelle', () => {
  it('macht aus einem Zähler Kästchen und aus einem Würfelwert Text', () => {
    const t = byColumn({ Rages: '3', 'Sneak Attack': '2d6' });

    expect(t.Rages).toMatchObject({ kind: 'count', max: 3, label: 'Kampfrausch' });
    // Der Bogen ist deutsch: die Tabelle liefert `2d6`, gedruckt wird `2W6`.
    expect(t['Sneak Attack']).toMatchObject({ kind: 'value', max: 0, text: '2W6' });
  });

  it('lässt weg, was schon anderswo auf dem Bogen steht', () => {
    const t = byColumn({
      '1st': '4', '5th': '2', Cantrips: '3', 'Cantrips Known': '3', 'Prepared Spells': '9',
      'Proficiency Bonus': '+3', 'Weapon Mastery': '3', 'Eldritch Invocations': '5',
      'Spell Slots': '2', 'Slot Level': '3',
    });

    expect(t).toEqual({});
  });

  it('zählt die Wildgestalt-Einsätze des Druiden', () => {
    expect(byColumn({ 'Wild Shape': '2' })['Wild Shape']).toMatchObject({
      kind: 'count', max: 2, label: 'Tiergestalt',
    });
  });

  it('übergeht eine unbekannte Spalte, statt zu werfen', () => {
    expect(() => resourceTracks({ 'Homebrew Punkte': '4' })).not.toThrow();
    expect(byColumn({ 'Homebrew Punkte': '4', Rages: '2' })).toHaveProperty('Rages');
    expect(byColumn({ 'Homebrew Punkte': '4' })).toEqual({});
  });

  it('wertet Leerzeichen und Gedankenstrich als „gibt es auf dieser Stufe nicht"', () => {
    expect(byColumn({ 'Sorcery Points': '', 'Focus Points': '—', Rages: '-' })).toEqual({});
  });

  it('zählt den Zauberpunkte-Vorrat des Zauberers auf seiner Stufe', () => {
    expect(byColumn({ 'Sorcery Points': '5' })['Sorcery Points']).toMatchObject({
      kind: 'count', max: 5, label: 'Zauberpunkte',
    });
  });

  it('hält die Reihenfolge der Tabelle, nicht die des Eingangs', () => {
    const order = resourceTracks({ 'Sneak Attack': '2d6', Rages: '2' }).map((t) => t.column);
    const expected = Object.keys(CLASS_RESOURCE_COLUMNS).filter((c) => order.includes(c));

    expect(order).toEqual(expected);
  });
});

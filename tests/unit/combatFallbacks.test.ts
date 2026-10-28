/**
 * Rückfallwerte für leere Kampfwerte: Bewegung aus den Merkmalen, Übungsbonus aus der Stufe.
 *
 *   npm run test -- combatFallbacks
 */
import { describe, expect, it } from 'vitest';
import { combatFallbacks, withCombatFallbacks } from '../../src/lib/services/combatFallbacks';
import { featureGrantSchema } from '../../src/lib/schemas/grants';
import { testCharacter } from '../support/testCharacter';
import type { CharacterClass } from '../../src/lib/schemas/characterSchema';

const cls = (level: number) => ({ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level }) as CharacterClass;
const speedFeature = (speedFeet: number) => ({ grants: featureGrantSchema.parse({ properties: { speedFeet } }) });

describe('combatFallbacks', () => {
  it('rechnet die deklarierte Bewegung in Meter mit Komma um', () => {
    expect(combatFallbacks([cls(1)], 14, [speedFeature(30)]).speed).toBe('9');
    expect(combatFallbacks([cls(1)], 14, [speedFeature(25)]).speed).toBe('7,5');
  });

  it('nimmt die höchste Deklaration und bleibt ohne leer', () => {
    expect(combatFallbacks([cls(1)], null, [speedFeature(30), speedFeature(35), {}]).speed).toBe('10,5');
    expect(combatFallbacks([cls(1)], null, [{}]).speed).toBe('');
    expect(combatFallbacks([cls(1)], null, null).speed).toBe('');
  });

  it('leitet den Übungsbonus aus der Gesamtstufe ab', () => {
    expect(combatFallbacks([cls(4)], null, null).proficiencyBonus).toBe(2);
    expect(combatFallbacks([cls(3), cls(2)], null, null).proficiencyBonus).toBe(3);
    expect(combatFallbacks([], null, null).proficiencyBonus).toBe(2);
  });
});

describe('withCombatFallbacks', () => {
  const fb = { ac: 15, speed: '9', proficiencyBonus: 3 };

  it('füllt nur leere Felder', () => {
    const c = testCharacter('Prüfling Kämpferin');
    const empty = withCombatFallbacks({ ...c, ac: ' ', speed: '', hpCurrent: '', hpMax: '40' }, fb);
    expect([empty.ac, empty.speed, empty.hpCurrent]).toEqual(['15', '9', '40']);

    const kept = withCombatFallbacks({ ...c, ac: '18', speed: '7,5', hpCurrent: '12' }, fb);
    expect([kept.ac, kept.speed, kept.hpCurrent]).toEqual(['18', '7,5', '12']);
  });

  it('lässt die RK leer, solange sie nicht berechnet ist', () => {
    expect(withCombatFallbacks({ ...testCharacter('Prüfling Kämpferin'), ac: '' }, { ...fb, ac: null }).ac).toBe('');
  });
});

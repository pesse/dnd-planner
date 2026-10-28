/**
 * Rückfallwerte für leere Kampfwerte: Bewegung aus den Merkmalen, Übungsbonus aus der Stufe.
 *
 *   npm run test -- combatFallbacks
 */
import { describe, expect, it } from 'vitest';
import { combatFallbacks, withCombatFallbacks } from '../../src/lib/services/combatFallbacks';
import { effectiveProficiencyBonus } from '../../src/lib/services/classProgression';
import { combatTips } from '../../src/lib/services/characterSheetTips';
import { featureGrantSchema } from '../../src/lib/schemas/grants';
import { testCharacter } from '../support/testCharacter';
import type { CharacterClass } from '../../src/lib/schemas/characterSchema';

const cls = (level: number) => ({ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level }) as CharacterClass;
const speedFeature = (speedFeet: number, name = 'Volk') => ({ name, grants: featureGrantSchema.parse({ properties: { speedFeet } }) });

describe('combatFallbacks', () => {
  it('rechnet die deklarierte Bewegung in Meter mit Komma um', () => {
    expect(combatFallbacks([cls(1)], 14, [speedFeature(30)]).speed).toBe('9');
    expect(combatFallbacks([cls(1)], 14, [speedFeature(25)]).speed).toBe('7,5');
  });

  it('nimmt die höchste Deklaration und bleibt ohne leer', () => {
    expect(combatFallbacks([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink'), { name: 'Leer' }]).speed).toBe('10,5');
    expect(combatFallbacks([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink')]).speedSource).toEqual({ labelDe: 'Flink', feet: 35 });
    expect(combatFallbacks([cls(1)], null, [{ name: 'Leer' }]).speed).toBe('');
    expect(combatFallbacks([cls(1)], null, null).speed).toBe('');
  });

  it('leitet den Übungsbonus aus der Gesamtstufe ab', () => {
    expect(combatFallbacks([cls(4)], null, null).proficiencyBonus).toBe(2);
    expect(combatFallbacks([cls(3), cls(2)], null, null).proficiencyBonus).toBe(3);
    expect(combatFallbacks([], null, null).proficiencyBonus).toBe(2);
  });
});

describe('withCombatFallbacks', () => {
  const fb = { ac: 15, speed: '9', speedSource: null, level: 5, proficiencyBonus: 3 };

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

describe('effectiveProficiencyBonus', () => {
  it('nimmt den eingetragenen Wert, sonst den der Stufe — auch für das geleerte Formularfeld', () => {
    expect(effectiveProficiencyBonus({ proficiencyBonus: 4, classes: [cls(1)] })).toBe(4);
    expect(effectiveProficiencyBonus({ classes: [cls(5)] })).toBe(3);
    expect(effectiveProficiencyBonus({ proficiencyBonus: null, classes: [cls(9)] })).toBe(4);
  });
});

describe('combatTips', () => {
  const fb = { ac: 15, speed: '9', speedSource: { labelDe: 'Elf', feet: 30 }, level: 5, proficiencyBonus: 3 };
  const c = { speed: '', hpCurrent: '', hpMax: '40', proficiencyBonus: undefined };

  it('nennt die Herkunft und meldet abweichende Einträge', () => {
    const tips = combatTips(c, fb);
    expect(tips.speed).toContain('Elf');
    expect(tips.speed).toContain('30 Fuß');
    expect(tips.proficiencyBonus).toContain('Gesamtstufe');
    expect(tips.hpCurrent).toContain('TP-Maximum');

    const stored = combatTips({ ...c, speed: '7,5', hpCurrent: '12', proficiencyBonus: 4 }, fb);
    expect(stored.speed).toContain('eingetragen 7,5 m');
    expect(stored.proficiencyBonus).toContain('eingetragen +4');
    expect(stored.hpCurrent).toBe('');
  });

  it('zeigt ohne Deklaration keine Bewegungs-Herleitung', () => {
    expect(combatTips(c, { ...fb, speedSource: null }).speed).toBe('');
  });
});

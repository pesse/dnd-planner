/**
 * Gerechnete Kampfwerte: Bewegung aus den Merkmalen, Übungsbonus aus der Stufe, Initiative aus
 * GES und Aufmerksam, jeweils samt benannter Anpassungen.
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
import { emptyCombatAdjustments, type CombatAdjustments } from '../../src/lib/schemas/combatAdjustment';

const cls = (level: number) => ({ sourceKey: 'srd-2024_fighter', name: 'Kämpfer', level }) as CharacterClass;
type Input = Parameters<typeof combatFallbacks>[0];
const fb = (classes: CharacterClass[], acTotal: number | null, features: Input['features'], dexMod = 0, more: Partial<Input> = {}) =>
  combatFallbacks({ classes, acTotal, hpTotal: null, features, dexMod, ...more });
const adjustments = (over: Partial<CombatAdjustments>): CombatAdjustments => ({ ...emptyCombatAdjustments(), ...over });
const speedFeature = (speedFeet: number, name = 'Volk') => ({ name, grants: featureGrantSchema.parse({ properties: { speedFeet } }) });

describe('combatFallbacks', () => {
  it('rechnet die deklarierte Bewegung in Meter mit Komma um', () => {
    expect(fb([cls(1)], 14, [speedFeature(30)]).speed).toBe('9');
    expect(fb([cls(1)], 14, [speedFeature(25)]).speed).toBe('7,5');
  });

  it('nimmt die höchste Deklaration und bleibt ohne leer', () => {
    expect(fb([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink'), { name: 'Leer' }]).speed).toBe('10,5');
    expect(fb([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink')]).speedRows).toEqual([{ labelDe: 'Flink', feet: 35 }]);
    expect(fb([cls(1)], null, [{ name: 'Leer' }]).speed).toBe('');
    expect(fb([cls(1)], null, null).speed).toBe('');
  });

  it('leitet den Übungsbonus aus der Gesamtstufe ab', () => {
    expect(fb([cls(4)], null, null).proficiencyBonus).toBe(2);
    expect(fb([cls(3), cls(2)], null, null).proficiencyBonus).toBe(3);
    expect(fb([], null, null).proficiencyBonus).toBe(2);
  });

  it('rechnet die Initiative aus GES, Aufmerksam addiert den wirksamen Übungsbonus', () => {
    expect(fb([cls(5)], null, [], 2).initiative).toBe('+2');
    expect(fb([cls(5)], null, [], -1).initiative).toBe('-1');
    const alert = { key: 'srd-2024_alert', name: 'Aufmerksam' };
    expect(fb([cls(5)], null, [alert], 2).initiative).toBe('+5');
    expect(fb([cls(5)], null, [alert], 2, { proficiencyBonus: 4 }).initiativeRows)
      .toEqual([{ labelDe: 'GES', value: 2 }, { labelDe: 'Aufmerksam', value: 4 }]);
  });

  it('zählt Anpassungen als eigene Posten auf Initiative und Bewegung', () => {
    const adj = adjustments({
      initiative: [{ amount: 1, reason: 'Segen des Spielleiters' }],
      speed: [{ amount: 5, reason: '' }],
    });
    const out = fb([cls(5)], null, [speedFeature(30, 'Elf')], 2, { combatAdjustments: adj });
    expect(out.initiative).toBe('+3');
    expect(out.initiativeRows.at(-1)).toMatchObject({ labelDe: 'Segen des Spielleiters', value: 1 });
    expect(out.speed).toBe('10,5');
    expect(out.speedRows).toEqual([{ labelDe: 'Elf', feet: 30 }, { labelDe: 'Anpassung', feet: 5 }]);
  });

  it('zählt Anpassungen des Übungsbonus, auch in Aufmerksam', () => {
    const adj = adjustments({ proficiencyBonus: [{ amount: 1, reason: 'Ioun-Stein (Meisterschaft)' }] });
    const out = fb([cls(5)], null, [{ key: 'srd-2024_alert', name: 'Aufmerksam' }], 2, { combatAdjustments: adj });
    expect(out.proficiencyBonus).toBe(4);
    expect(out.proficiencyBonusRows).toMatchObject([{ labelDe: 'Stufe 5', value: 3 }, { labelDe: 'Ioun-Stein (Meisterschaft)', value: 1 }]);
    expect(out.initiative).toBe('+6');
  });

  it('lässt eine Bewegungs-Anpassung ohne Deklaration wirkungslos', () => {
    expect(fb([cls(1)], null, [], 0, { combatAdjustments: adjustments({ speed: [{ amount: 5, reason: '' }] }) }).speed).toBe('');
  });
});

describe('withCombatFallbacks', () => {
  const stub = { ac: 15, hpMax: 44, speed: '9', speedRows: [], level: 5, proficiencyBonus: 3, proficiencyBonusRows: [], initiative: '+2', initiativeRows: [] };

  it('rechnet leere Felder, ein eingetragener Altwert gewinnt noch', () => {
    const c = testCharacter('Prüfling Kämpferin');
    const empty = withCombatFallbacks({ ...c, ac: ' ', initiative: '', speed: '', hpCurrent: '', hpMax: '' }, stub);
    expect([empty.ac, empty.initiative, empty.speed, empty.hpMax, empty.hpCurrent]).toEqual(['15', '+2', '9', '44', '44']);

    const kept = withCombatFallbacks({ ...c, ac: '18', initiative: '+4', speed: '7,5', hpMax: '40', hpCurrent: '12' }, stub);
    expect([kept.ac, kept.initiative, kept.speed, kept.hpMax, kept.hpCurrent]).toEqual(['18', '+4', '7,5', '40', '12']);
  });

  it('lässt RK und TP-Maximum leer, solange sie nicht berechnet sind', () => {
    const out = withCombatFallbacks({ ...testCharacter('Prüfling Kämpferin'), ac: '', hpMax: '', hpCurrent: '' }, { ...stub, ac: null, hpMax: null });
    expect([out.ac, out.hpMax, out.hpCurrent]).toEqual(['', '', '']);
  });
});

describe('effectiveProficiencyBonus', () => {
  it('nimmt den eingetragenen Wert, sonst den der Stufe — auch für das geleerte Formularfeld', () => {
    expect(effectiveProficiencyBonus({ proficiencyBonus: 4, classes: [cls(1)] })).toBe(4);
    expect(effectiveProficiencyBonus({ classes: [cls(5)] })).toBe(3);
    expect(effectiveProficiencyBonus({ proficiencyBonus: null, classes: [cls(9)] })).toBe(4);
    const ioun = { proficiencyBonus: [{ amount: 1, reason: '' }] };
    expect(effectiveProficiencyBonus({ classes: [cls(5)], combatAdjustments: ioun })).toBe(4);
    expect(effectiveProficiencyBonus({ proficiencyBonus: 3, classes: [cls(5)], combatAdjustments: ioun })).toBe(3);
  });
});

describe('combatTips', () => {
  const fb = {
    ac: 15, hpMax: 40, speed: '9', speedRows: [{ labelDe: 'Elf', feet: 30 }], level: 5, proficiencyBonus: 3,
    proficiencyBonusRows: [{ labelDe: 'Stufe 5', value: 3 }],
    initiative: '+5', initiativeRows: [{ labelDe: 'GES', value: 2 }, { labelDe: 'Aufmerksam', value: 3 }],
  };
  const c = { initiative: '', speed: '', hpCurrent: '', hpMax: '', proficiencyBonus: undefined };

  it('nennt die Herkunft und meldet abweichende Einträge', () => {
    const tips = combatTips(c, fb);
    expect(tips.speed).toContain('Elf');
    expect(tips.speed).toContain('30 Fuß');
    expect(tips.proficiencyBonus).toContain('Stufe 5');
    expect(tips.hpCurrent).toContain('TP-Maximum');
    expect(tips.hpCurrent).toContain('40');
    expect(tips.initiative).toContain('Aufmerksam');

    expect(combatTips({ ...c, initiative: '+5' }, fb).initiative).not.toContain('eingetragen');
    expect(combatTips({ ...c, initiative: '+1' }, fb).initiative).toContain('eingetragen +1');

    const stored = combatTips({ ...c, speed: '7,5', hpCurrent: '12', proficiencyBonus: 4 }, fb);
    expect(stored.speed).toContain('eingetragen 7,5 m');
    expect(stored.proficiencyBonus).toContain('eingetragen +4');
    expect(stored.hpCurrent).toBe('');
  });

  it('zeigt ohne Deklaration keine Bewegungs-Herleitung', () => {
    expect(combatTips(c, { ...fb, speedRows: [] }).speed).toBe('');
  });
});

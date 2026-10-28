/**
 * Rückfallwerte für leere Kampfwerte: Bewegung aus den Merkmalen, Übungsbonus aus der Stufe,
 * Initiative aus GES und deklarierten Zuschlägen.
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
const mods = (dex: number, wis = 0) => ({ str: 0, dex, con: 0, int: 0, wis, cha: 0 });
const fb = (classes: CharacterClass[], acTotal: number | null, features: Parameters<typeof combatFallbacks>[0]['features'], dexMod = 0) =>
  combatFallbacks({ classes, acTotal, features, mods: mods(dexMod) });
const initiativeFeature = (name: string, initiative: unknown[]) => ({ name, grants: featureGrantSchema.parse({ initiative }) });
const speedFeature = (speedFeet: number, name = 'Volk') => ({ name, grants: featureGrantSchema.parse({ properties: { speedFeet } }) });

describe('combatFallbacks', () => {
  it('rechnet die deklarierte Bewegung in Meter mit Komma um', () => {
    expect(fb([cls(1)], 14, [speedFeature(30)]).speed).toBe('9');
    expect(fb([cls(1)], 14, [speedFeature(25)]).speed).toBe('7,5');
  });

  it('nimmt die höchste Deklaration und bleibt ohne leer', () => {
    expect(fb([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink'), { name: 'Leer' }]).speed).toBe('10,5');
    expect(fb([cls(1)], null, [speedFeature(30), speedFeature(35, 'Flink')]).speedSource).toEqual({ labelDe: 'Flink', feet: 35 });
    expect(fb([cls(1)], null, [{ name: 'Leer' }]).speed).toBe('');
    expect(fb([cls(1)], null, null).speed).toBe('');
  });

  it('leitet den Übungsbonus aus der Gesamtstufe ab', () => {
    expect(fb([cls(4)], null, null).proficiencyBonus).toBe(2);
    expect(fb([cls(3), cls(2)], null, null).proficiencyBonus).toBe(3);
    expect(fb([], null, null).proficiencyBonus).toBe(2);
  });

  it('rechnet die Initiative aus GES, ein Übungsbonus-Zuschlag addiert den wirksamen', () => {
    expect(fb([cls(5)], null, [], 2).initiative).toBe('+2');
    expect(fb([cls(5)], null, [], -1).initiative).toBe('-1');
    const alert = initiativeFeature('Aufmerksam', [{ kind: 'bonus', value: 'proficiency-bonus' }]);
    expect(fb([cls(5)], null, [alert], 2).initiative).toBe('+5');
    expect(combatFallbacks({ classes: [cls(5)], proficiencyBonus: 4, acTotal: null, features: [alert], mods: mods(2) }).initiativeRows)
      .toEqual([{ labelDe: 'GES', value: 2 }, { labelDe: 'Aufmerksam', value: 4 }]);
  });

  it('addiert einen Attributsmodifikator und sammelt Vorteil getrennt', () => {
    const ambusher = initiativeFeature('Fürchterlicher Lauerjäger', [{ kind: 'bonus', value: { abilityMod: 'Wisdom', min: 0 } }]);
    const assassin = initiativeFeature('Attentat', [{ kind: 'advantage' }]);
    const r = combatFallbacks({ classes: [cls(3)], acTotal: null, features: [ambusher, assassin, assassin], mods: mods(3, 2) });
    expect(r.initiative).toBe('+5');
    expect(r.initiativeAdvantage).toEqual(['Attentat']);
    expect(combatTips({ initiative: '', speed: '', hpCurrent: '', hpMax: '' }, r).initiative).toContain('Vorteil (Attentat)');
  });
});

describe('withCombatFallbacks', () => {
  const stub = { ac: 15, speed: '9', speedSource: null, level: 5, proficiencyBonus: 3, initiative: '+2', initiativeRows: [], initiativeAdvantage: [] };

  it('füllt nur leere Felder', () => {
    const c = testCharacter('Prüfling Kämpferin');
    const empty = withCombatFallbacks({ ...c, ac: ' ', initiative: '', speed: '', hpCurrent: '', hpMax: '40' }, stub);
    expect([empty.ac, empty.initiative, empty.speed, empty.hpCurrent]).toEqual(['15', '+2', '9', '40']);

    const kept = withCombatFallbacks({ ...c, ac: '18', initiative: '+4', speed: '7,5', hpCurrent: '12' }, stub);
    expect([kept.ac, kept.initiative, kept.speed, kept.hpCurrent]).toEqual(['18', '+4', '7,5', '12']);
  });

  it('lässt die RK leer, solange sie nicht berechnet ist', () => {
    expect(withCombatFallbacks({ ...testCharacter('Prüfling Kämpferin'), ac: '' }, { ...stub, ac: null }).ac).toBe('');
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
  const fb = {
    ac: 15, speed: '9', speedSource: { labelDe: 'Elf', feet: 30 }, level: 5, proficiencyBonus: 3,
    initiative: '+5', initiativeRows: [{ labelDe: 'GES', value: 2 }, { labelDe: 'Aufmerksam', value: 3 }], initiativeAdvantage: [],
  };
  const c = { initiative: '', speed: '', hpCurrent: '', hpMax: '40', proficiencyBonus: undefined };

  it('nennt die Herkunft und meldet abweichende Einträge', () => {
    const tips = combatTips(c, fb);
    expect(tips.speed).toContain('Elf');
    expect(tips.speed).toContain('30 Fuß');
    expect(tips.proficiencyBonus).toContain('Gesamtstufe');
    expect(tips.hpCurrent).toContain('TP-Maximum');
    expect(tips.initiative).toContain('Aufmerksam');

    expect(combatTips({ ...c, initiative: '+5' }, fb).initiative).not.toContain('eingetragen');
    expect(combatTips({ ...c, initiative: '+1' }, fb).initiative).toContain('eingetragen +1');

    const stored = combatTips({ ...c, speed: '7,5', hpCurrent: '12', proficiencyBonus: 4 }, fb);
    expect(stored.speed).toContain('eingetragen 7,5 m');
    expect(stored.proficiencyBonus).toContain('eingetragen +4');
    expect(stored.hpCurrent).toBe('');
  });

  it('zeigt ohne Deklaration keine Bewegungs-Herleitung', () => {
    expect(combatTips(c, { ...fb, speedSource: null }).speed).toBe('');
  });
});

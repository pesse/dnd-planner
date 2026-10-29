/**
 * Die Umstellung eingetragener Altwerte von RK, TP-Maximum, Initiative und Bewegungsrate auf
 * „gerechnet + benannte Anpassungen".
 *
 *   npm run test -- combatOverrides
 */
import { describe, expect, it } from 'vitest';
import {
  adoptOverride, armorClassHints, clearOverride, combatOverrides, deltaLabel, type OverrideTarget,
} from '../../src/lib/services/combatOverrides';
import { emptyCombatAdjustments } from '../../src/lib/schemas/combatAdjustment';
import type { CombatFallbacks } from '../../src/lib/services/combatFallbacks';
import { buildItemIndex, type ItemInfo } from '../../src/lib/itemLibrary';

const FB: CombatFallbacks = {
  ac: 13, hpMax: 44, speed: '9', speedRows: [{ labelDe: 'Elf', feet: 30 }],
  level: 5, proficiencyBonus: 3, initiative: '+2', initiativeRows: [],
};

const stored = (over: Partial<Record<'ac' | 'hpMax' | 'initiative' | 'speed', string>>) =>
  ({ ac: '', hpMax: '', initiative: '', speed: '', ...over });

const overrides = (over: Parameters<typeof stored>[0], more: Partial<Parameters<typeof combatOverrides>[0]> = {}) =>
  combatOverrides({ stored: stored(over), fb: FB, hpDiceTotal: 30, acHints: [], ...more });

describe('combatOverrides', () => {
  it('bietet nur eingetragene Werte an', () => {
    expect(overrides({})).toEqual([]);
    expect(overrides({ ac: '14' }).map((o) => o.stat)).toEqual(['ac']);
  });

  it('liest die führende Zahl, auch aus der Schild-Schreibweise', () => {
    expect(overrides({ ac: '14' })[0]).toMatchObject({ computed: '13', delta: 1 });
    expect(overrides({ ac: '13/14' })[0].delta).toBe(0);
    expect(overrides({ ac: '11 (13)' })[0].delta).toBe(-2);
    expect(overrides({ initiative: '+3' })[0].delta).toBe(1);
    expect(overrides({ initiative: '−1' })[0].delta).toBe(-3);
  });

  it('rechnet die Bewegungsrate in Fuß, aus „9m" wie aus „10,5"', () => {
    const [o] = overrides({ speed: '10,5' });
    expect(o).toMatchObject({ computed: '9 m', delta: 5 });
    expect(deltaLabel(o)).toBe('+5 Fuß');
    expect(overrides({ speed: '9m' })[0].delta).toBe(0);
  });

  it('übernimmt kein TP-Maximum, solange die Würfelsumme fehlt', () => {
    const [o] = overrides({ hpMax: '45' }, { hpDiceTotal: undefined });
    expect(o.computed).toBeNull();
    expect(o.delta).toBeNull();
    expect(o.hints).toContain('erst die Würfelsumme eintragen');
    expect(overrides({ hpMax: '45' })[0].delta).toBe(1);
  });

  it('ohne Deklaration ist die Bewegungsrate nicht rechenbar', () => {
    const [o] = combatOverrides({ stored: stored({ speed: '9' }), fb: { ...FB, speed: '', speedRows: [] }, hpDiceTotal: 30, acHints: [] });
    expect(o.computed).toBeNull();
    expect(o.hints).toEqual(['kein verlinktes Volk mit Bewegungsrate']);
  });

  it('hängt die RK-Hinweise an die RK', () => {
    const list = overrides({ ac: '16', initiative: '+2' }, { acHints: ['nicht verlinkt: Lederrüstung'] });
    expect(list.find((o) => o.stat === 'ac')?.hints).toEqual(['nicht verlinkt: Lederrüstung']);
    expect(list.find((o) => o.stat === 'initiative')?.hints).toEqual([]);
  });
});

describe('Umstellen', () => {
  const target = (over: Partial<OverrideTarget> = {}): OverrideTarget =>
    ({ ...stored({ ac: '14', speed: '10,5' }), combatAdjustments: emptyCombatAdjustments(), ...over });

  it('übernimmt die Abweichung als Anpassung und leert das Feld', () => {
    const t = target();
    for (const o of overrides({ ac: t.ac, speed: t.speed })) adoptOverride(t, o);
    expect([t.ac, t.speed]).toEqual(['', '']);
    expect(t.combatAdjustments.ac).toEqual([{ amount: 1, reason: 'aus dem eingetragenen Wert' }]);
    expect(t.combatAdjustments.speed).toEqual([{ amount: 5, reason: 'aus dem eingetragenen Wert' }]);
  });

  it('legt bei gleichem Wert keine Null-Anpassung an', () => {
    const t = target({ ac: '13' });
    adoptOverride(t, overrides({ ac: '13' })[0]);
    expect(t.ac).toBe('');
    expect(t.combatAdjustments.ac).toEqual([]);
  });

  it('leert nur das Feld', () => {
    const t = target();
    clearOverride(t, overrides({ ac: '14' })[0]);
    expect(t.ac).toBe('');
    expect(t.combatAdjustments.ac).toEqual([]);
  });
});

describe('armorClassHints', () => {
  const index = buildItemIndex({
    armor: [
      { key: 'srd-2024_chain-mail', name: 'Chain Mail', name_de: 'Kettenpanzer', armor_category: 'Heavy', armor_class: { base: 16, dex_bonus: false, max_bonus: null } },
      { key: 'srd-2024_shield', name: 'Shield', name_de: 'Schild', armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false, max_bonus: null } },
    ] as ItemInfo[],
  });

  it('nennt unbekannte Zeilen und nicht angelegte Rüstung', () => {
    const hints = armorClassHints(index, [
      { name: 'Kettenpanzer', sourceKey: 'srd-2024_chain-mail', count: '1', weight: '', equipped: true },
      { name: 'Schild', sourceKey: 'srd-2024_shield', count: '1', weight: '' },
      { name: 'Elfenmantel vom Flohmarkt', count: '1', weight: '' },
    ]);
    expect(hints).toEqual(['nicht verlinkt: Elfenmantel vom Flohmarkt', 'Schild: nicht angelegt']);
  });
});

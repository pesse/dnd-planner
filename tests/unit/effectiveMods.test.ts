/**
 * Wirksame Mods an beiden Schreibstellen (Formular, `applyChanges`) und ihre Herleitung im
 * Tooltip: ein Posten pro Zeile, Erläuterungen eingerückt darunter.
 *
 *   npm run test -- effectiveMods
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { formDraftPatch, initialFormCarry, initialFormFields } from '../../src/lib/services/characterFormFields';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { resolveScore, type WornAbilityEffect } from '../../src/lib/services/effectiveAbilities';
import { hpDerivation } from '../../src/lib/services/hitPointDerivation';
import { attrModTip, hpTip } from '../../src/lib/services/characterSheetTips';
import type { Change } from '../../src/lib/schemas/levelUp';

const AMULET: WornAbilityEffect = {
  itemId: 'srd-2024_amulet-of-health', labelDe: 'Amulett der Gesundheit', effect: { kind: 'set', ability: 'con', value: 19 },
};
const GAUNTLETS: WornAbilityEffect = {
  itemId: 'srd-2024_gauntlets-of-ogre-power', labelDe: 'Handschuhe der Ogerstärke', effect: { kind: 'set', ability: 'str', value: 19 },
};
const HAMMER: WornAbilityEffect = {
  itemId: 'srd-2024_hammer-of-thunderbolts-maul', labelDe: 'Hammer der Donnerkeile',
  effect: { kind: 'add', ability: 'str', value: 4, max: 30, onSetBy: [GAUNTLETS.itemId] },
};

// Parcival: Paladin 5, KON 13, Fertigkeit Athletik (STÄ) geübt.
const parcival = () => characterSchema.parse({
  name: 'Prüfling Parcival',
  classes: [{ sourceKey: 'srd-2024_paladin', name: 'Paladin', level: 5 }],
  abilities: { str: 16, dex: 10, con: 13, int: 10, wis: 10, cha: 14 },
  proficiencyBonus: 3,
  hpMax: '60',
});

const text = (html: string): string[] =>
  [...html.matchAll(/<span class="tip-row[^"]*">(.*?<\/span>.*?<\/span>)<\/span>|<span class="tip-step">(.*?)<\/span>/g)]
    .map((m) => (m[1] ?? m[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

describe('wirksame Mods im Formular', () => {
  it('schreibt den Mod samt Gegenstand, der Grundwert bleibt', () => {
    const c = parcival();
    const patch = formDraftPatch(initialFormFields(c), initialFormCarry(c), [AMULET]);
    expect(patch.abilities.con).toBe(13);
    expect(patch.mods.con).toBe(4);
  });

  it('Fertigkeiten und Angriffe rechnen mit dem wirksamen Mod', () => {
    const c = parcival();
    const fields = initialFormFields(c);
    fields.skillFlags.Athletik = { prof: true, exp: false };
    const patch = formDraftPatch(fields, initialFormCarry(c), [GAUNTLETS, HAMMER]);
    // STÄ 19 + 4 = 23 → +6, plus Übung 3.
    expect(patch.mods.str).toBe(6);
    expect(patch.skills.Athletik.value).toBe(9);
  });
});

describe('wirksame Mods im Aufstieg', () => {
  const asi: Change = { target: 'ability', ability: 'con', value: 1, max: 20, step: 'assemble-decisions', source: 'asi', label: '' };

  it('eine Erhöhung unter dem gesetzten Wert lässt den wirksamen Mod stehen', () => {
    const c = parcival();
    applyChanges(c, [asi], { classIndex: 0, abilityEffects: [AMULET] });
    expect(c.abilities.con).toBe(14);
    expect(c.mods.con).toBe(4);
  });

  it('ohne Gegenstand der Mod des neuen Grundwerts', () => {
    const c = parcival();
    applyChanges(c, [asi], { classIndex: 0 });
    expect(c.mods.con).toBe(2);
  });
});

describe('Attributs-Tooltip', () => {
  it('ohne Gegenstand wie bisher: Wert, −10, ÷2, Mod', () => {
    expect(text(attrModTip('KON', resolveScore(13, [], 'con')))).toEqual(['KON 13', '− 10', '÷ 2', '+1']);
  });

  it('nennt Grundwert und Gegenstand je auf einer Zeile', () => {
    expect(text(attrModTip('KON', resolveScore(13, [AMULET], 'con')))).toEqual([
      'Grundwert 13', 'Amulett der Gesundheit: KON 19', 'KON 19', '− 10', '÷ 2', '+4',
    ]);
  });

  it('ein Gegenstand unter dem Grundwert steht als wirkungslos da', () => {
    expect(text(attrModTip('KON', resolveScore(20, [AMULET], 'con')))[1]).toBe('Amulett der Gesundheit: wirkungslos');
  });

  it('weist auf einen noch mit dem Grundwert gespeicherten Mod hin', () => {
    expect(text(attrModTip('KON', resolveScore(13, [AMULET], 'con'), 1)).at(-1)).toBe('gespeichert +1: im Editor neu speichern');
  });
});

describe('TP-Herleitung', () => {
  const basis = { conMod: 4, level: 5, perLevel: 0, maxDice: 50 };
  const con = resolveScore(13, [AMULET], 'con');

  it('Würfel, KON × Stufe mit Gegenstand, Summe', () => {
    const d = hpDerivation({ hpMax: '60', hpDiceTotal: undefined }, basis, con, []);
    expect(d.total).toBe(60);
    expect(text(hpTip(d))).toEqual([
      'Trefferwürfel 40', 'zurückgerechnet aus dem TP-Maximum',
      'KON +4 × Stufe 5 +20', 'Amulett der Gesundheit: KON 19', 'ohne Gegenstände: +1',
      'TP-Maximum 60',
    ]);
  });

  it('ein Bonus je Stufe ist ein eigener Posten', () => {
    const d = hpDerivation(
      { hpMax: '70', hpDiceTotal: 40 }, { ...basis, perLevel: 2 }, con,
      [{ feature: 'Zäh', sourceKey: 'phb-2024_tough', amount: 2 }],
    );
    expect(text(hpTip(d))).toEqual([
      'Trefferwürfel 40', 'KON +4 × Stufe 5 +20', 'Amulett der Gesundheit: KON 19', 'ohne Gegenstände: +1',
      'Zäh +2 × Stufe 5 +10', 'TP-Maximum 70',
    ]);
  });

  it('meldet eine Abweichung zum eingetragenen Maximum', () => {
    const d = hpDerivation({ hpMax: '62', hpDiceTotal: 40 }, basis, con, []);
    expect(text(hpTip(d)).slice(-2)).toEqual(['eingetragen 62', 'Abweichung +2']);
  });

  it('eine unmögliche Würfelsumme erscheint nicht als Posten', () => {
    const d = hpDerivation({ hpMax: '60', hpDiceTotal: undefined }, { ...basis, conMod: 1 }, resolveScore(13, [], 'con'), []);
    expect(d.total).toBeNull();
    expect(text(hpTip(d))).toEqual(['KON +1 × Stufe 5 +5', 'Würfelsumme 55 unmöglich (höchstens 50)']);
  });
});

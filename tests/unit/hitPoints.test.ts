/**
 * Trefferpunkte als Würfelsumme: was rückwirkend wirkt (KON, Boni je Stufe), rechnet der
 * Aufstieg über ALLE Stufen — und Bestandscharaktere bekommen ihre Summe zurückgerechnet.
 *
 *   npm run test -- hitPoints
 */
import { describe, expect, it } from 'vitest';
import { hitPointChanges, type HitPointParams } from '../../src/lib/services/levelUp/hitPoints';
import { hpDiceTotalOf } from '../../src/lib/services/hitPoints';
import { hitPointsFix, type LegacyLinkLibraries, type LegacyLinkTarget } from '../../src/lib/services/characterLegacyLinks';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import type { LevelUpDelta } from '../../src/lib/services/levelUp';
import type { HpPerLevelSource } from '../../src/lib/services/levelUp/runState';
import type { Change } from '../../src/lib/schemas/levelUp';
import type { WornAbilityEffect } from '../../src/lib/services/effectiveAbilities';

const AMULET: WornAbilityEffect[] = [{ itemId: 'srd-2024_amulet-of-health', labelDe: 'Amulett der Gesundheit', effect: { kind: 'set', ability: 'con', value: 19 } }];

/** Paladin 2 → 3, KON 13: Bölgörs Stand (10 + 7 gewürfelt + 2×1 KON = 19). */
const delta = (over: Partial<LevelUpDelta> = {}): LevelUpDelta =>
  ({ hitDie: 10, fromLevel: 2, toLevel: 3, levelsGained: 1, newTotalLevel: 3, asiCount: 0, ...over } as LevelUpDelta);

const params = (over: Partial<HitPointParams> = {}): HitPointParams => ({
  delta: delta(),
  answers: {},
  before: { hpMax: '19', conScore: 13 },
  sources: [],
  others: [],
  ...over,
});

const hpGain = (changes: Change[]): number =>
  changes.reduce((n, c) => (c.target === 'hpMax' ? n + c.value : n), 0);
const diceTotal = (changes: Change[]): number | undefined =>
  changes.find((c): c is Extract<Change, { target: 'hpDiceTotal' }> => c.target === 'hpDiceTotal')?.value;

const toughness = (owned: boolean): HpPerLevelSource => ({ feature: 'Zwergische Zähigkeit', sourceKey: 'srd-2024_dwarf_dwarven-toughness', amount: 1, perLevel: true, owned });
const tough = (owned: boolean): HpPerLevelSource => ({ feature: 'Zäh', sourceKey: 'phb-2024_tough', amount: 2, perLevel: true, owned });
const fortitude = (owned: boolean): HpPerLevelSource => ({ feature: 'Gabe der Standhaftigkeit', sourceKey: 'phb-2024_boon-of-fortitude', amount: 40, perLevel: false, owned });

describe('TP im Aufstieg', () => {
  it('Durchschnitt plus KON, die Würfelsumme aus dem bisherigen Maximum zurückgerechnet', () => {
    const changes = hitPointChanges(params());
    expect(hpGain(changes)).toBe(6 + 1);
    expect(diceTotal(changes)).toBe(17 + 6);
  });

  it('nimmt beim Würfeln nur die Würfel in die Summe, KON bleibt draußen', () => {
    const changes = hitPointChanges(params({ answers: { hp_method: 'roll', hp_roll: '9' } }));
    expect(hpGain(changes)).toBe(9 + 1);
    expect(diceTotal(changes)).toBe(17 + 9);
  });

  it('rechnet einen höheren KON-Mod rückwirkend für alle Stufen', () => {
    const asi: Change = { target: 'ability', ability: 'con', value: 1, max: 20, step: 'assemble-decisions', source: 'asi', label: '' };
    const changes = hitPointChanges(params({
      delta: delta({ fromLevel: 3, toLevel: 4, newTotalLevel: 4 }),
      before: { hpMax: '25', conScore: 13 },
      others: [asi],
    }));
    // 6 Würfel + (2 × 4 − 1 × 3) KON
    expect(hpGain(changes)).toBe(6 + 5);
  });

  it('zählt einen neu gewonnenen Bonus für alle Stufen, einen vorhandenen nur für die neuen', () => {
    const changes = hitPointChanges(params({
      delta: delta({ fromLevel: 3, toLevel: 4, newTotalLevel: 4 }),
      before: { hpMax: '31', conScore: 13 },
      sources: [toughness(true), tough(false)],
    }));
    expect(hpGain(changes)).toBe(6 + 1 + 1 + 2 * 4);
    // 31 − 3 × (1 KON + 1 Zähigkeit) = 25; Zäh gehört NICHT in den Altbestand.
    expect(diceTotal(changes)).toBe(25 + 6);
  });

  it('zählt einen festen Zuschlag einmal beim Erwerb und danach nie wieder', () => {
    const gained = hitPointChanges(params({ sources: [fortitude(false)] }));
    expect(hpGain(gained)).toBe(6 + 1 + 40);
    expect(diceTotal(gained)).toBe(17 + 6);

    // 59 − 2 × 1 KON − 40 = 17: der vorhandene Zuschlag gehört nicht in die Würfelsumme.
    const owned = hitPointChanges(params({ before: { hpMax: '59', conScore: 13 }, sources: [fortitude(true)] }));
    expect(hpGain(owned)).toBe(6 + 1);
    expect(diceTotal(owned)).toBe(17 + 6);
  });

  it('bevorzugt die gespeicherte Summe vor der Rückrechnung', () => {
    const changes = hitPointChanges(params({ before: { hpMax: '30', hpDiceTotal: 17, conScore: 13 } }));
    expect(diceTotal(changes)).toBe(23);
    expect(hpGain(changes)).toBe(7);
  });

  it('schreibt keine Summe, wenn das bisherige Maximum keine Zahl ist', () => {
    const changes = hitPointChanges(params({ before: { hpMax: '', conScore: 13 } }));
    expect(diceTotal(changes)).toBeUndefined();
    expect(hpGain(changes)).toBe(7);
  });

  it('schreibt eine unmögliche Rückrechnung nicht fest, addiert aber weiter', () => {
    // Parcival ohne bekanntes Amulett: Paladin 5, KON 13, 60 TP hieße eine Würfelsumme von 55.
    const changes = hitPointChanges(params({
      delta: delta({ fromLevel: 5, toLevel: 6, newTotalLevel: 6 }),
      before: { hpMax: '60', conScore: 13, maxDice: 50 },
    }));
    expect(diceTotal(changes)).toBeUndefined();
    expect(hpGain(changes)).toBe(6 + 1);
  });

  it('rechnet mit der KON, die ein wirkender Gegenstand setzt', () => {
    // Parcival mit Amulett der Gesundheit: KON 19 statt 13, also 60 − 5 × 4 = 40.
    const changes = hitPointChanges(params({
      delta: delta({ fromLevel: 5, toLevel: 6, newTotalLevel: 6 }),
      before: { hpMax: '60', conScore: 13, abilityEffects: AMULET, maxDice: 50 },
    }));
    expect(diceTotal(changes)).toBe(40 + 6);
    expect(hpGain(changes)).toBe(6 + 4);
  });

  it('eine KON-Erhöhung unter dem gesetzten Wert ändert den Mod nicht', () => {
    const asi: Change = { target: 'ability', ability: 'con', value: 1, max: 20, step: 'assemble-decisions', source: 'asi', label: '' };
    const changes = hitPointChanges(params({
      delta: delta({ fromLevel: 3, toLevel: 4, newTotalLevel: 4 }),
      before: { hpMax: '37', conScore: 13, abilityEffects: AMULET },
      others: [asi],
    }));
    expect(hpGain(changes)).toBe(6 + 4);
  });

  it('landet über die Senke als Summe UND als neues Maximum am Charakter', () => {
    const c = characterSchema.parse({ name: 'Prüfling', hpMax: '19', abilities: { str: 10, dex: 10, con: 13, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, hitPointChanges(params()), { classIndex: 0 });
    expect(c.hpMax).toBe('26');
    expect(c.hpDiceTotal).toBe(23);
    expect(hpDiceTotalOf({ hpMax: c.hpMax, hpDiceTotal: undefined }, { conMod: 1, level: 3, perLevel: 0 })).toBe(23);
  });

  it('schreibt ohne eingetragenes Maximum nur die Würfelsumme — das Maximum rechnet sich', () => {
    const c = characterSchema.parse({ name: 'Prüfling', hpDiceTotal: 17, abilities: { str: 10, dex: 10, con: 13, int: 10, wis: 10, cha: 10 } });
    applyChanges(c, hitPointChanges(params({ before: { hpMax: '', hpDiceTotal: 17, conScore: 13 } })), { classIndex: 0 });
    expect(c.hpMax).toBe('');
    expect(c.hpDiceTotal).toBe(23);
  });
});

/** Nur die Felder, die `hitPointsFix` liest. */
function target(over: Partial<LegacyLinkTarget> = {}): LegacyLinkTarget & { written?: number } {
  const t = {
    classes: [{ sourceKey: 'srd-2024_paladin', name: 'Paladin', level: 2 }],
    species: { sourceKey: 'srd-2024_dragonborn', name: 'Drachenblütiger' },
    hpMax: '19',
    hpDiceTotal: undefined,
    written: undefined as number | undefined,
    splitHitPoints: (n: number) => { t.written = n; t.hpDiceTotal = n as never; t.hpMax = ''; },
    ...over,
  };
  return t as unknown as LegacyLinkTarget & { written?: number };
}

const libs = (perLevel = 0, conMod = 1, level = 2, maxDice?: number) =>
  ({ hpBasis: { conMod, level, perLevel, maxDice } } as unknown as LegacyLinkLibraries);

describe('Würfelsumme für Bestandscharaktere', () => {
  it('rechnet aus dem Maximum zurück und schreibt einmal', () => {
    const t = target();
    const fix = hitPointsFix(t, libs());
    expect(fix?.kind).toBe('hitPoints');
    fix!.apply();
    expect(t.written).toBe(17);
    expect(t.hpMax).toBe('');
    expect(hitPointsFix(t, libs())).toBeUndefined();
  });

  it('zieht die Boni je Stufe mit ab', () => {
    const t = target({ species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' }, hpMax: '21' });
    hitPointsFix(t, libs(1))!.apply();
    expect(t.written).toBe(17);
  });

  it('wartet auf die Bibliothek und auf verlinkte Klassen und Völker', () => {
    expect(hitPointsFix(target(), { hpBasis: null } as unknown as LegacyLinkLibraries)).toBeUndefined();
    expect(hitPointsFix(target({ classes: [{ sourceKey: '', name: 'Paladin', level: 2 }] }), libs())).toBeUndefined();
    expect(hitPointsFix(target({ species: { sourceKey: '', name: 'Zwerg' } }), libs())).toBeUndefined();
  });

  it('bietet nichts an, wenn das Maximum mit keinem Würfelergebnis vereinbar ist', () => {
    expect(hitPointsFix(target({ hpMax: '200' }), libs())).toBeUndefined();
    // Paladin 5 mit W10: höchstens 50 — ein Maximum von 60 bei KON +1 hieße 55.
    expect(hitPointsFix(target({ hpMax: '60' }), libs(0, 1, 5, 50))).toBeUndefined();
    expect(hitPointsFix(target({ hpMax: '55' }), libs(0, 1, 5, 50))).toBeDefined();
    expect(hitPointsFix(target({ hpMax: '2' }), libs())).toBeUndefined();
    expect(hitPointsFix(target({ hpMax: '' }), libs())).toBeUndefined();
  });
});

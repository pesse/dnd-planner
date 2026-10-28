/**
 * Die Grundlage der Würfelsummen-Rückrechnung über den ECHTEN Vault: Boni je Stufe aus Volk,
 * Klassen, Talent-Links und Herkunftstalent, die Obergrenze aus den Trefferwürfeln der Klassen.
 *
 *   npm run test -- hitPointBasis
 */
import { describe, expect, it } from 'vitest';
import { maxDiceTotal, ownedGrantFeatures, ownedHpPerLevel, hpDiceTotalOf } from '../../src/lib/services/hitPoints';
import { mod } from '../../src/lib/domain/skills';
import { testCharacter } from '../support/testCharacter';

describe('TP-Grundlage aus der Bibliothek', () => {
  it('kennt die Zwergische Zähigkeit und den W8 des Druiden', async () => {
    const c = testCharacter('Prüfling Druide');
    expect(await ownedHpPerLevel(c)).toBe(1);
    expect(await maxDiceTotal(c.classes)).toBe(16);
  });

  it('zählt ein verlinktes Zäh dazu', async () => {
    const c = testCharacter('Prüfling Druide');
    c.features = [...c.features, { sourceKey: 'phb-2024_tough', name: 'Zäh', choice: '', choiceDe: '', choiceId: '', gainedAt: 1, desc: '' }];
    expect(await ownedHpPerLevel(c)).toBe(3);
  });

  it('zählt das Zäh des Bauern-Hintergrunds, auch wenn es zusätzlich verlinkt ist, nur einmal', async () => {
    const c = { ...testCharacter('Prüfling Druide'), backgroundRef: { sourceKey: 'phb-2024_farmer', name: 'Bauer' } };
    expect(await ownedHpPerLevel(c)).toBe(3);
    c.features = [...c.features, { sourceKey: 'phb-2024_tough', name: 'Zäh', choice: '', choiceDe: '', choiceId: '', gainedAt: 1, desc: '' }];
    expect(await ownedHpPerLevel(c)).toBe(3);
  });

  it('führt das Aufmerksam der Wache unter den Merkmalen', async () => {
    const keys = (await ownedGrantFeatures(testCharacter('Prüfling Druide'))).map((f) => f.key);
    expect(keys).toContain('srd-2024_alert');
  });

  it('rechnet die Würfelsumme des Prüflings in den möglichen Bereich zurück', async () => {
    const c = testCharacter('Prüfling Druide');
    const level = 2;
    const total = hpDiceTotalOf(c, { conMod: mod(c.abilities.con), level, perLevel: await ownedHpPerLevel(c) });
    expect(total).not.toBeNull();
    expect(total!).toBeGreaterThanOrEqual(level);
    expect(total!).toBeLessThanOrEqual(16);
  });

  it('kennt keine Obergrenze, solange eine Klasse unverlinkt ist', async () => {
    expect(await maxDiceTotal([{ sourceKey: '', name: 'Hausregel', level: 3 }])).toBeUndefined();
  });
});

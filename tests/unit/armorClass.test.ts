/**
 * RK-Herleitung aus angelegten Gegenständen und Merkmals-Deklarationen.
 *
 *   npm run test -- armorClass
 */
import { describe, expect, it } from 'vitest';
import { armorClassDerivation, type ArmorClassFeature } from '../../src/lib/services/armorClass';
import { acTip } from '../../src/lib/services/characterSheetTips';
import type { ItemInfo } from '../../src/lib/itemLibrary';
import type { WornItem } from '../../src/lib/services/wornItems';
import type { FeatureGrant } from '../../src/lib/schemas/grants';
import { featureGrantSchema } from '../../src/lib/schemas/grants';
import type { AbilityScores } from '../../src/lib/schemas/abilities';

const item = (key: string, name_de: string, extra: Partial<ItemInfo>): WornItem => ({
  id: key,
  item: { key, name: key, name_de, category: 'armor', rarity: '—', path: '', magic: false, ...extra },
});

const CHAIN_MAIL = item('chain-mail', 'Kettenpanzer', {
  armor_category: 'Heavy', armor_class: { base: 16, dex_bonus: false, max_bonus: null },
});
const HALF_PLATE = item('half-plate', 'Plattenharnisch', {
  armor_category: 'Medium', armor_class: { base: 15, dex_bonus: true, max_bonus: 2 },
});
const SHIELD_1 = item('shield-plus-1', 'Schild (+1)', {
  armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false, max_bonus: null }, magic_bonus: 1,
});
const RING = item('ring-of-protection', 'Ring des Schutzes', {
  armorClassEffects: [{ kind: 'bonus', value: 1, when: 'always' }],
});
const BRACERS = item('bracers-of-defense', 'Armschienen der Verteidigung', {
  armorClassEffects: [{ kind: 'bonus', value: 2, when: 'unarmoredNoShield' }],
});

const grants = (armorClass: FeatureGrant['armorClass']): FeatureGrant => featureGrantSchema.parse({ armorClass });
const DEFENSE: ArmorClassFeature = {
  key: 'srd-2024_defense', name: 'Verteidigung', grants: grants([{ kind: 'bonus', value: 1, when: 'armored' }]),
};
const BARBARIAN_UD: ArmorClassFeature = {
  key: 'srd-2024_barbarian_unarmored-defense', name: 'Ungerüstete Verteidigung',
  grants: grants([{ kind: 'unarmored', base: 10, abilities: ['dex', 'con'], shield: true }]),
};
const MONK_UD: ArmorClassFeature = {
  key: 'srd-2024_monk_unarmored-defense', name: 'Ungerüstete Verteidigung',
  grants: grants([{ kind: 'unarmored', base: 10, abilities: ['dex', 'wis'], shield: false }]),
};

const mods = (m: Partial<AbilityScores>): AbilityScores => ({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...m });

const rows = (d: ReturnType<typeof armorClassDerivation>) => d.rows.map((r) => [r.labelDe, r.value]);

const text = (html: string): string[] =>
  [...html.matchAll(/<span class="tip-row[^"]*">(.*?<\/span>.*?<\/span>)<\/span>|<span class="tip-step">(.*?)<\/span>/g)]
    .map((m) => (m[1] ?? m[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

describe('armorClassDerivation', () => {
  it('Rüstung mit GES-Grenze: der Überschuss steht als Erläuterung', () => {
    const d = armorClassDerivation({ ac: '17', worn: [HALF_PLATE], features: [], mods: mods({ dex: 4 }) });
    expect(rows(d)).toEqual([['Plattenharnisch', 15], ['GES', 2]]);
    expect(d.rows[1].notes).toEqual(['+4, höchstens +2']);
    expect(d.total).toBe(17);
  });

  it('zwei angelegte Rüstungen: gezählt wird die stärkere, die Herleitung sagt es', () => {
    const d = armorClassDerivation({ ac: '17', worn: [HALF_PLATE, CHAIN_MAIL], features: [], mods: mods({ dex: 4 }) });
    expect(rows(d)).toEqual([['Plattenharnisch', 15], ['GES', 2]]);
    expect(d.notes).toContain('2 Rüstungen angelegt, gezählt nur Plattenharnisch');
  });

  it('Schild, Schutzring und Kampfstil Verteidigung kommen auf die Rüstung', () => {
    const d = armorClassDerivation({
      ac: '21', worn: [CHAIN_MAIL, SHIELD_1, RING], features: [DEFENSE], mods: mods({ dex: 1 }),
    });
    expect(rows(d)).toEqual([['Kettenpanzer', 16], ['Schild (+1)', 3], ['Ring des Schutzes', 1], ['Verteidigung', 1]]);
    expect(d.total).toBe(21);
    expect(text(acTip(d))).toEqual([
      'Kettenpanzer 16', 'Schild (+1) +3', '2 +1 magisch', 'Ring des Schutzes +1', 'Verteidigung +1', 'RK 21',
    ]);
  });

  it('ohne Rüstung: 10 + GES, Kampfstil und Armschienen nach Bedingung', () => {
    const d = armorClassDerivation({ ac: '14', worn: [BRACERS], features: [DEFENSE], mods: mods({ dex: 2 }) });
    expect(rows(d)).toEqual([['ohne Rüstung', 10], ['GES', 2], ['Armschienen der Verteidigung', 2]]);
    expect(d.notes).toEqual(['Verteidigung +1: nur in Rüstung']);
  });

  it('Ungerüstete Verteidigung gewinnt ohne Rüstung', () => {
    const d = armorClassDerivation({ ac: '15', worn: [], features: [BARBARIAN_UD], mods: mods({ dex: 2, con: 3 }) });
    expect(rows(d)).toEqual([['Ungerüstete Verteidigung', 10], ['GES', 2], ['KON', 3]]);
    expect(d.total).toBe(15);
  });

  it('angelegte Rüstung schlägt Ungerüstete Verteidigung — die steht eingerückt darunter', () => {
    const d = armorClassDerivation({ ac: '16', worn: [CHAIN_MAIL], features: [BARBARIAN_UD], mods: mods({ dex: 1, con: 2 }) });
    expect(rows(d)).toEqual([['Kettenpanzer', 16]]);
    expect(d.rows[0].notes).toEqual(['Ungerüstete Verteidigung ohne Rüstung: 13']);
  });

  it('Mönch mit Schild verliert die Ungerüstete Verteidigung', () => {
    const shield = item('shield', 'Schild', { armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false, max_bonus: null } });
    const d = armorClassDerivation({ ac: '14', worn: [shield], features: [MONK_UD], mods: mods({ dex: 2, wis: 3 }) });
    expect(rows(d)).toEqual([['ohne Rüstung', 10], ['GES', 2], ['Schild', 2]]);
  });

  it('ein Lage-Bonus zählt nicht und steht unter seinem Gegenstand', () => {
    const arrow = item('arrow-catching-shield', 'Pfeilfangschild', {
      armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false, max_bonus: null },
      armorClassEffects: [{ kind: 'situational', value: 2, condition: 'against ranged attack rolls', conditionDe: 'gegen Fernkampfangriffe' }],
    });
    const d = armorClassDerivation({ ac: '12', worn: [arrow], features: [], mods: mods({}) });
    expect(d.total).toBe(12);
    expect(text(acTip(d))).toEqual(['ohne Rüstung 10', 'GES +0', 'Pfeilfangschild +2', '+2 gegen Fernkampfangriffe', 'RK 12']);
  });

  it('liest die führende Zahl einer Freitext-RK', () => {
    expect(armorClassDerivation({ ac: '18 (20)', worn: [], features: [], mods: mods({}) }).stored).toBe(18);
  });

  it('meldet die Abweichung zum eingetragenen Wert', () => {
    const d = armorClassDerivation({ ac: '21', worn: [CHAIN_MAIL], features: [], mods: mods({}) });
    expect(d.stored).toBe(21);
    expect(text(acTip(d))).toContain('eingetragen 21 · Abweichung +5');
  });

  it('nennt RK-Gegenstände, die nicht angelegt oder nicht eingestimmt sind', () => {
    const d = armorClassDerivation({
      ac: '18', worn: [],
      idle: [{ item: HALF_PLATE.item, reason: 'unequipped' }, { item: RING.item, reason: 'unattuned' }],
      features: [], mods: mods({}),
    });
    expect(d.notes).toEqual(['Plattenharnisch: nicht angelegt', 'Ring des Schutzes: nicht eingestimmt']);
  });

  it('erkennt Ungerüstete Verteidigung ohne Deklaration am Key und Text', () => {
    const undeclared: ArmorClassFeature = {
      key: 'srd-2024_monk_unarmored-defense', name: 'Ungerüstete Verteidigung',
      desc: 'Solange du keine Rüstung trägst und keinen Schild führst, entspricht deine Basis-Rüstungsklasse 10 plus deinem Geschicklichkeits- und Weisheitsmodifikator.',
    };
    const d = armorClassDerivation({ ac: '', worn: [], features: [undeclared], mods: mods({ dex: 3, wis: 2 }) });
    expect(rows(d)).toEqual([['Ungerüstete Verteidigung', 10], ['GES', 3], ['WEI', 2]]);
    expect(d.notes).toEqual(['keine RK eingetragen']);
  });
});

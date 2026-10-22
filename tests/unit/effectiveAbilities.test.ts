/**
 * Wirksame Attributswerte: ein Gegenstand setzt den Wert nur, solange er angelegt und — falls
 * verlangt — eingestimmt ist, und nie unter den Grundwert.
 *
 *   npm run test -- effectiveAbilities
 */
import { describe, expect, it } from 'vitest';
import { buildItemIndex, type ItemInfo } from '../../src/lib/itemLibrary';
import { effectiveScores, wornAbilityEffects } from '../../src/lib/services/effectiveAbilities';
import { wornItemsIn } from '../../src/lib/services/wornItems';
import { mod } from '../../src/lib/domain/skills';
import { abilityRecordOf } from '../../src/lib/schemas/abilities';
import type { CharacterInventoryEntry } from '../../src/lib/schemas/characterSchema';

const item = (key: string, name: string, over: Partial<ItemInfo> = {}): ItemInfo => ({
  key, name, category: 'wondrous-item', rarity: 'Rare', magic: true, path: `${key}.json`, ...over,
});

const AMULET = item('srd-2024_amulet-of-health', 'Amulet of Health', {
  name_de: 'Amulett der Gesundheit', attunement: true, abilityEffects: [{ kind: 'set', ability: 'con', value: 19 }],
});
const HILL_BELT = item('srd-2024_belt-of-giant-strength-hill', 'Belt of Giant Strength (Hill)', {
  attunement: true, abilityEffects: [{ kind: 'set', ability: 'str', value: 21 }],
});
const GAUNTLETS = item('srd-2024_gauntlets-of-ogre-power', 'Gauntlets of Ogre Power', {
  attunement: true, abilityEffects: [{ kind: 'set', ability: 'str', value: 19 }],
});
const HAMMER = item('srd-2024_hammer-of-thunderbolts-maul', 'Hammer of Thunderbolts (Maul)', {
  category: 'weapon', attunement: true,
  abilityEffects: [{ kind: 'add', ability: 'str', value: 4, max: 30, onSetBy: [HILL_BELT.key!, GAUNTLETS.key!] }],
});
const index = buildItemIndex({ 'wondrous-item': [AMULET, HILL_BELT, GAUNTLETS], weapon: [HAMMER] });

const line = (name: string, over: Partial<CharacterInventoryEntry> = {}): CharacterInventoryEntry => ({
  name, count: '1', weight: '', ...over,
});

// Parcival: Paladin 5, KON 13.
const base = { ...abilityRecordOf(() => 10), con: 13 };
const effective = (inventory: CharacterInventoryEntry[], scores = base) =>
  effectiveScores(scores, wornAbilityEffects(wornItemsIn(index, inventory)));

describe('wirksame Attributswerte', () => {
  it('angelegtes und eingestimmtes Amulett setzt KON 19 (Mod +4)', () => {
    const a = effective([line('Amulett der Gesundheit', { equipped: true, attuned: true })]);
    expect(a.con).toBe(19);
    expect(mod(a.con)).toBe(4);
  });

  it('ohne Amulett gilt der Grundwert', () => {
    expect(effective([]).con).toBe(13);
  });

  it('nicht eingestimmt wirkt das Amulett nicht', () => {
    expect(effective([line('Amulett der Gesundheit', { equipped: true })]).con).toBe(13);
  });

  it('nur getragen, nicht angelegt, wirkt es nicht', () => {
    expect(effective([line('Amulett der Gesundheit', { attuned: true })]).con).toBe(13);
  });

  it('verlinkt über sourceKey statt Namen', () => {
    const a = effective([line('Halskette', { sourceKey: AMULET.key, equipped: true, attuned: true })]);
    expect(a.con).toBe(19);
  });

  it('setzt, addiert nicht: ein höherer Grundwert bleibt', () => {
    const a = effective([line('Amulett der Gesundheit', { equipped: true, attuned: true })], { ...base, con: 20 });
    expect(a.con).toBe(20);
  });

  it('mehrere Setzer auf dasselbe Attribut: der höchste gilt', () => {
    const a = effective([
      line('Gauntlets of Ogre Power', { equipped: true, attuned: true }),
      line('Belt of Giant Strength (Hill)', { equipped: true, attuned: true }),
    ]);
    expect(a.str).toBe(21);
  });
});

describe('Hammer der Donnerkeile', () => {
  const hammer = line('Hammer of Thunderbolts (Maul)', { equipped: true, attuned: true });

  it('hebt den vom Gürtel gesetzten Wert um 4', () => {
    expect(effective([hammer, line('Belt of Giant Strength (Hill)', { equipped: true, attuned: true })]).str).toBe(25);
  });

  it('wirkt auch mit den Handschuhen allein', () => {
    expect(effective([hammer, line('Gauntlets of Ogre Power', { equipped: true, attuned: true })]).str).toBe(23);
  });

  it('ohne Gürtel oder Handschuhe kein Zuschlag', () => {
    expect(effective([hammer]).str).toBe(10);
  });

  it('kein Zuschlag, wenn der Grundwert über dem der Handschuhe liegt', () => {
    const a = effective([hammer, line('Gauntlets of Ogre Power', { equipped: true, attuned: true })], { ...base, str: 20 });
    expect(a.str).toBe(20);
  });

  it('gedeckelt auf 30', () => {
    const storm = item('srd-2024_belt-of-giant-strength-storm', 'Belt of Giant Strength (Storm)', {
      attunement: true, abilityEffects: [{ kind: 'set', ability: 'str', value: 29 }],
    });
    const stormHammer = { ...HAMMER, abilityEffects: [{ kind: 'add' as const, ability: 'str' as const, value: 4, max: 30, onSetBy: [storm.key!] }] };
    const idx = buildItemIndex({ x: [storm, stormHammer] });
    const worn = wornItemsIn(idx, [hammer, line('Belt of Giant Strength (Storm)', { equipped: true, attuned: true })]);
    expect(effectiveScores(base, wornAbilityEffects(worn)).str).toBe(30);
  });
});

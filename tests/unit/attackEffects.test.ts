/**
 * Deklarierte Wirkungen auf auto-berechnete Angriffe: Filter über die verknüpfte Waffe,
 * von Hand eingetragene Effekte, Lage-Boni und abweichender Magie-Bonus.
 *
 *   npm run test -- attackEffects
 */
import { describe, expect, it } from 'vitest';
import {
  attackEffectSources, attackFootnotes, criticalRange, criticalRangeDe, ownWeaponNotes,
  type AttackEffectFeature, type DeclaredAttackEffects,
} from '../../src/lib/services/attackEffects';
import {
  attackBonusParts, attackDamageParts, blankAttack, computeAttackBonus, computeAttackDamage, type AttackCalcContext,
} from '../../src/lib/services/attackCalc';
import type { ItemInfo } from '../../src/lib/itemLibrary';
import type { WornItem } from '../../src/lib/services/wornItems';
import type { Attack } from '../../src/lib/schemas/characterSchema';
import { featureGrantSchema, type FeatureGrant } from '../../src/lib/schemas/grants';

const info = (key: string, name_de: string, extra: Partial<ItemInfo>): ItemInfo =>
  ({ key, name: key, name_de, category: 'weapon', rarity: '—', path: '', magic: false, ...extra });

const LONGBOW = info('longbow', 'Langbogen', { index: 'longbow', weapon_range: 'Ranged' });
const OATHBOW = info('oathbow', 'Eidbogen', { index: 'longbow', weapon_range: 'Ranged', magic_bonus: 0 });
const HAND_CROSSBOW = info('hand-crossbow', 'Handarmbrust', { index: 'hand-crossbow', weapon_range: 'Ranged' });
const LONGSWORD = info('longsword', 'Langschwert', { index: 'longsword', weapon_range: 'Melee' });
const BERSERKER = info('berserker-battleaxe', 'Berserker-Streitaxt', { index: 'battleaxe', weapon_range: 'Melee', magic_bonus: 1 });
const FLAME_TONGUE = info('flame-tongue-longsword', 'Flammenzunge (Langschwert)', {
  index: 'longsword', weapon_range: 'Melee', magic: true,
  attackEffects: [{ kind: 'dice', dice: '2d6', damageType: 'fire', range: 'any', self: true, condition: 'while ablaze', conditionDe: 'solange die Klinge brennt' }],
});
const WEAPONS = [LONGBOW, OATHBOW, HAND_CROSSBOW, LONGSWORD, BERSERKER, FLAME_TONGUE];

const BRACERS: WornItem = {
  id: 'bracers-of-archery',
  item: info('bracers-of-archery', 'Armreifen der Bogenschützen', {
    category: 'wondrous-item',
    attackEffects: [{ kind: 'bonus', attack: 0, damage: 2, range: 'any', weapons: ['longbow', 'shortbow'] }],
  }),
};

const grants = (attack: FeatureGrant['attack']): FeatureGrant => featureGrantSchema.parse({ attack });
const ARCHERY: AttackEffectFeature = {
  key: 'srd-2024_archery', name: 'Bogenschießen', grants: grants([{ kind: 'bonus', attack: 2, damage: 0, range: 'ranged' }]),
};
const DUELING: AttackEffectFeature = {
  key: 'homebrew_dueling', name: 'Duellieren',
  grants: grants([{ kind: 'situational', roll: 'damage', value: 2, condition: 'one weapon', conditionDe: 'ohne zweite Waffe', range: 'melee' }]),
};
const SPELL_ATTACK: AttackEffectFeature = {
  key: 'homebrew_blessed', name: 'Gesegnet', grants: grants([{ kind: 'bonus', attack: 1, damage: 0, range: 'any' }]),
};

function ctx(worn: WornItem[], features: AttackEffectFeature[]): AttackCalcContext {
  const declared: DeclaredAttackEffects = {
    sources: attackEffectSources(worn, features),
    weaponOf: (a) => WEAPONS.find((w) => w.key === a.sourceKey),
  };
  return { strMod: 1, dexMod: 3, proficiencyBonus: 2, declared };
}

const attack = (weapon: ItemInfo | undefined, extra: Partial<Attack> = {}): Attack => ({
  ...blankAttack(),
  name: weapon?.name_de ?? 'Faustschlag',
  sourceKey: weapon?.key,
  ability: weapon?.weapon_range === 'Ranged' ? 'dex' : 'str',
  proficient: true,
  baseDamage: '1W8',
  magicBonus: weapon?.magic_bonus ?? 0,
  ...extra,
});

describe('Deklarierte Angriffswirkungen', () => {
  it('Bogenschießen und Armreifen wirken auf den Langbogen', () => {
    const c = ctx([BRACERS], [ARCHERY]);
    expect(computeAttackBonus(attack(LONGBOW), c)).toBe('+7');
    expect(computeAttackDamage(attack(LONGBOW), c)).toBe('1W8+5');
    expect(attackBonusParts(attack(LONGBOW), c).parts.map((p) => p.labelDe)).toEqual(['GES', 'geübt', 'Bogenschießen']);
  });

  it('ein magischer Bogen zählt über seine Grundwaffe', () => {
    expect(computeAttackDamage(attack(OATHBOW), ctx([BRACERS], []))).toBe('1W8+5');
  });

  it('die Armreifen wirken nicht auf die Handarmbrust, Bogenschießen schon', () => {
    const c = ctx([BRACERS], [ARCHERY]);
    expect(computeAttackBonus(attack(HAND_CROSSBOW), c)).toBe('+7');
    expect(computeAttackDamage(attack(HAND_CROSSBOW), c)).toBe('1W8+3');
  });

  it('Fernkampf-Wirkungen lassen Nahkampfwaffen in Ruhe', () => {
    const c = ctx([BRACERS], [ARCHERY]);
    expect(computeAttackBonus(attack(LONGSWORD), c)).toBe('+3');
    expect(attackBonusParts(attack(LONGSWORD), c).notes).toEqual([]);
  });

  it('ohne Waffen-Filter wirkt ein Bonus auch auf unverknüpfte Angriffe', () => {
    expect(computeAttackBonus(attack(undefined), ctx([], [SPELL_ATTACK]))).toBe('+4');
  });

  it('ein Filter auf einem unverknüpften Angriff zählt nicht und sagt warum', () => {
    const parts = attackBonusParts(attack(undefined), ctx([], [ARCHERY]));
    expect(parts.parts.map((p) => p.labelDe)).toEqual(['STÄ', 'geübt']);
    expect(parts.notes).toEqual(['Bogenschießen: Waffe nicht mit der Bibliothek verknüpft']);
  });

  it('ein von Hand eingetragener Effekt gleichen Namens zählt nicht doppelt', () => {
    const a = attack(LONGBOW, { modifiers: [{ label: 'Kampfstil „Bogenschießen“', attackBonus: 2, damageBonus: 0 }] });
    const parts = attackBonusParts(a, ctx([], [ARCHERY]));
    expect(computeAttackBonus(a, ctx([], [ARCHERY]))).toBe('+7');
    expect(parts.notes).toEqual(['Bogenschießen: schon als Effekt eingetragen']);
  });

  it('ein Lage-Bonus zählt nie und steht beim Schaden als Hinweis', () => {
    const c = ctx([], [DUELING]);
    expect(computeAttackDamage(attack(LONGSWORD), c)).toBe('1W8+1');
    expect(attackDamageParts(attack(LONGSWORD), c).notes).toEqual(['Duellieren +2: ohne zweite Waffe']);
    expect(attackBonusParts(attack(LONGSWORD), c).notes).toEqual([]);
  });

  it('ein Lage-Bonus in Höhe des Übungsbonus nennt die Zahl', () => {
    const gwm: AttackEffectFeature = {
      key: 'homebrew_gwm', name: 'Meister der Großwaffen',
      grants: grants([{ kind: 'situational', roll: 'damage', value: 'proficiency-bonus', condition: 'on a hit', conditionDe: 'bei Treffer', range: 'any' }]),
    };
    expect(attackDamageParts(attack(LONGSWORD), ctx([], [gwm])).notes).toEqual(['Meister der Großwaffen +2: bei Treffer']);
  });

  it('ein Hinweis trifft nur Waffen mit der verlangten Eigenschaft und steht beim Angriff', () => {
    const roots: AttackEffectFeature = {
      key: 'homebrew_roots', name: 'Schlagende Wurzeln',
      grants: grants([{ kind: 'note', condition: 'reach', conditionDe: 'Reichweite +3 m', range: 'melee', properties: ['heavy', 'versatile'] }]),
    };
    const versatile = { ...LONGSWORD, properties: [{ index: 'versatile', name: 'Versatile' }] };
    const c = { ...ctx([], [roots]), declared: { sources: attackEffectSources([], [roots]), weaponOf: () => versatile } };
    expect(attackBonusParts(attack(versatile), c).notes).toEqual(['Schlagende Wurzeln: Reichweite +3 m']);
    expect(attackBonusParts(attack(LONGSWORD), ctx([], [roots])).notes).toEqual([]);
    expect(attackFootnotes([roots])).toEqual(['Schlagende Wurzeln: Reichweite +3 m (Nahkampf; Schwer oder Vielseitig)']);
  });

  it('ein Hinweis mit Schadensart trifft nur Waffen dieser Art', () => {
    const piercer: AttackEffectFeature = {
      key: 'homebrew_piercer', name: 'Durchbohrer',
      grants: grants([{ kind: 'note', condition: 'reroll', conditionDe: 'einen Schadenswürfel neu würfeln', range: 'any', damageTypes: ['piercing'] }]),
    };
    const typed = (w: ItemInfo, type: string) => ({ ...w, damage: { damage_dice: '1d8', damage_type: { index: type, name: type } } });
    const notesWith = (w: ItemInfo) =>
      attackBonusParts(attack(w), { ...ctx([], [piercer]), declared: { sources: attackEffectSources([], [piercer]), weaponOf: () => w } }).notes;
    expect(notesWith(typed(LONGBOW, 'piercing'))).toEqual(['Durchbohrer: einen Schadenswürfel neu würfeln']);
    expect(notesWith(typed(LONGSWORD, 'slashing'))).toEqual([]);
    expect(attackFootnotes([piercer])).toEqual(['Durchbohrer: einen Schadenswürfel neu würfeln (Stichschaden)']);
  });

  it('Zusatzwürfel wachsen mit der Stufe des Merkmals und stehen beim Schaden', () => {
    const strikes = (level: number): AttackEffectFeature => ({
      key: 'homebrew_strikes', name: 'Schreckliche Schläge', level,
      grants: grants([{ kind: 'dice', dice: { byLevel: { '3': '1d4', '11': '1d6' } }, damageType: 'psychic', condition: 'once per turn', conditionDe: 'einmal pro Zug', range: 'any' }]),
    });
    const notes = (level: number) => attackDamageParts(attack(LONGSWORD), ctx([], [strikes(level)])).notes;
    expect(notes(3)).toEqual(['Schreckliche Schläge +1W4 Psychischer Schaden: einmal pro Zug']);
    expect(notes(11)).toEqual(['Schreckliche Schläge +1W6 Psychischer Schaden: einmal pro Zug']);
    expect(notes(2)).toEqual([]);
    expect(computeAttackDamage(attack(LONGSWORD), ctx([], [strikes(11)]))).toBe('1W8+1');
    expect(attackFootnotes([strikes(3), { name: 'Verbesserter kritischer Treffer', grants: featureGrantSchema.parse({ criticalHit: 19 }) }])).toEqual([
      'Kritischer Treffer bei 19–20 (Verbesserter kritischer Treffer)',
      'Schreckliche Schläge +1W4 Psychischer Schaden: einmal pro Zug',
    ]);
  });

  it('weicht der Magie-Bonus von der Bibliothek ab, nennt der Tooltip ihn', () => {
    const parts = attackBonusParts(attack(BERSERKER, { magicBonus: 0 }), ctx([], []));
    expect(parts.notes).toEqual(['Berserker-Streitaxt: laut Bibliothek Magie +1']);
    expect(attackBonusParts(attack(BERSERKER), ctx([], [])).notes).toEqual([]);
  });

  it('ohne Deklarationen rechnet der Angriff wie bisher', () => {
    expect(computeAttackBonus(attack(LONGBOW), { strMod: 1, dexMod: 3, proficiencyBonus: 2 })).toBe('+5');
  });

  it('ein Merkmal aus zwei Quellen wirkt einmal', () => {
    expect(computeAttackBonus(attack(LONGBOW), ctx([], [ARCHERY, ARCHERY]))).toBe('+7');
  });
});

describe('criticalRange', () => {
  const crit = (name: string, criticalHit?: number): AttackEffectFeature =>
    ({ name, grants: featureGrantSchema.parse(criticalHit === undefined ? {} : { criticalHit }) });

  it('nimmt den weitesten deklarierten Bereich', () => {
    const range = criticalRange([crit('Verbesserter kritischer Treffer', 19), crit('Überlegener kritischer Treffer', 18), crit('Leer')]);
    expect(range).toEqual({ minRoll: 18, labelDe: 'Überlegener kritischer Treffer' });
    expect(criticalRangeDe(range!)).toBe('Kritischer Treffer bei 18–20 (Überlegener kritischer Treffer)');
  });

  it('bleibt ohne Deklaration leer', () => {
    expect(criticalRange([crit('Leer'), { name: 'Ohne Grants' }])).toBeNull();
  });
});

describe('Wirkung nur der eigenen Waffe (`self`)', () => {
  const flameTongue: WornItem = { id: 'flame', item: FLAME_TONGUE };

  it('steht unter genau dieser Waffe, auch wenn sie nicht angelegt ist', () => {
    const c = ctx([], []);
    expect(ownWeaponNotes(attack(FLAME_TONGUE), c.declared)).toEqual([
      { origin: 'item', labelDe: 'Flammenzunge (Langschwert)', text: '+2W6 Feuerschaden: solange die Klinge brennt' },
    ]);
    expect(attackDamageParts(attack(FLAME_TONGUE), c).notes.join()).toContain('+2W6 Feuerschaden');
  });

  it('springt nicht auf andere Waffen über, auch angelegt nicht', () => {
    const c = ctx([flameTongue], []);
    expect(ownWeaponNotes(attack(LONGSWORD), c.declared)).toEqual([]);
    expect(attackDamageParts(attack(LONGSWORD), c).notes.join()).not.toContain('Feuer');
  });
});

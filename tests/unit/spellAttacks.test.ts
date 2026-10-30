/**
 * Zauber als Angriffszeilen: Bonus bzw. SG, Schaden nach Charakterstufe und gewähltem Grad,
 * Zusatzwürfel aus Zaubern und der Rückfall auf gespeicherte Werte.
 *
 *   npm run test -- spellAttacks
 */
import { describe, expect, it } from 'vitest';
import { attackEffectSources, attackFootnotes, type DeclaredAttackEffects } from '../../src/lib/services/attackEffects';
import {
  attackBonusParts, attackDamageParts, blankAttack, computeAttackBonus, computeAttackDamage, type AttackCalcContext,
} from '../../src/lib/services/attackCalc';
import { buildAttackFromSpell, spellAttackSourceOf, spellRidersOf } from '../../src/lib/services/spellAttacks';
import { spellAttackSummary } from '../../src/lib/services/spellAttackCalc';
import { buildSpellIndex, type SpellInfo } from '../../src/lib/spellLibrary';
import type { Attack } from '../../src/lib/schemas/characterSchema';

const spell = (key: string, name: string, level: number, extra: Partial<SpellInfo>): SpellInfo =>
  ({ key, name, level, classes: [], school: 'evocation', path: `./vault/spells/${key}.json`, ...extra });

const FIRE_BOLT = spell('fire-bolt', 'Feuerpfeil', 0, {
  range: '36 Meter', attack: { roll: 'attack', range: 'ranged', damage: [{ dice: '1d10', type: 'fire' }] },
});
const ELDRITCH = spell('eldritch-blast', 'Schauriger Strahl', 0, {
  attack: { roll: 'attack', range: 'ranged', damage: [{ dice: '1d10', type: 'force' }], cantrip: 'count' },
});
const FIREBALL = spell('fireball', 'Feuerball', 3, {
  attack: { roll: 'save', save: 'dex', onSave: 'half', damage: [{ dice: '8d6', type: 'fire' }], upcast: { dice: '1d6' } },
});
const MISSILE = spell('magic-missile', 'Magisches Geschoss', 1, {
  attack: { roll: 'auto', damage: [{ dice: '1d4', bonus: 1, type: 'force' }], count: 3, upcast: { count: 1 } },
});
const FLAME_STRIKE = spell('flame-strike', 'Flammenschlag', 5, {
  attack: { roll: 'save', save: 'dex', onSave: 'half', damage: [{ dice: '5d6', type: 'fire' }, { dice: '5d6', type: 'radiant' }], upcast: { dice: '1d6' } },
});
const ICE_STORM = spell('ice-storm', 'Eissturm', 4, {
  attack: { roll: 'save', save: 'dex', onSave: 'half', damage: [{ dice: '2d10', type: 'bludgeoning' }, { dice: '4d6', type: 'cold' }], upcast: { dice: '1d10' } },
});
const SPIRITUAL = spell('spiritual-weapon', 'Spirituelle Waffe', 2, {
  attack: { roll: 'attack', range: 'melee', damage: [{ dice: '1d8', type: 'force', addMod: true }], upcast: { dice: '1d8' } },
});
const HUNTERS_MARK = spell('hunters-mark', 'Zeichen des Jägers', 1, {
  attackEffects: [{ kind: 'dice', dice: '1d6', damageType: 'force', spellAttacks: true, condition: 'marked', conditionDe: 'gegen das markierte Ziel' }],
});
const DIVINE_SMITE = spell('divine-smite', 'Göttliches Niederstrecken', 1, {
  attackEffects: [{ kind: 'dice', dice: '2d8', damageType: 'radiant', range: 'melee', condition: 'after a hit', conditionDe: 'nach einem Treffer' }],
});
const BROKEN = spell('broken', 'Kaputt', 1, { attack: { roll: 'attack', damage: [] } });

const INDEX = buildSpellIndex([FIRE_BOLT, ELDRITCH, FIREBALL, MISSILE, FLAME_STRIKE, ICE_STORM, SPIRITUAL, HUNTERS_MARK, DIVINE_SMITE, BROKEN]);
const MODS = { str: 0, dex: 2, con: 1, int: 4, wis: 3, cha: 1 };

function ctx(characterLevel: number, riders: SpellInfo[] = []): AttackCalcContext {
  const declared: DeclaredAttackEffects = {
    sources: attackEffectSources([], [], riders.map((r) => ({ name: r.name, effects: spellRidersOf(r) }))),
    weaponOf: () => undefined,
  };
  return {
    strMod: MODS.str, dexMod: MODS.dex, proficiencyBonus: 3, declared,
    spells: { spellOf: spellAttackSourceOf(INDEX), mods: MODS, characterLevel },
  };
}

const row = (info: SpellInfo, extra: Partial<Attack> = {}, c = ctx(5)): Attack =>
  ({ ...buildAttackFromSpell(info, 'int', c), ...extra });

describe('Zauberzeile: Bonus und SG', () => {
  it('Zauberangriff = Übungsbonus + Zauberattribut', () => {
    const a = row(FIRE_BOLT);
    expect(a.bonus).toBe('+7');
    expect(a.type).toBe('Feuer');
    expect(a.range).toBe('36 m');
    expect(a.spell).toEqual({ key: 'fire-bolt', ability: 'int' });
  });

  it('Rettungswurf-Zauber zeigen den SG mit dem Attribut des Rettungswurfs', () => {
    expect(computeAttackBonus(row(FIREBALL), ctx(5))).toBe('SG 15 GES');
    expect(computeAttackBonus(row(FIREBALL, { spell: { key: 'fireball', ability: 'wis' } }), ctx(5))).toBe('SG 14 GES');
    expect(attackBonusParts(row(FIREBALL), ctx(5)).notes).toContain('Rettungswurf GES; gelungen: halber Schaden');
  });

  it('Magisches Geschoss trifft ohne Wurf', () => {
    expect(computeAttackBonus(row(MISSILE), ctx(5))).toBe('trifft');
  });

  it('Magie und Effekte der Zeile zählen auf den Wurf', () => {
    const a = row(FIRE_BOLT, { magicBonus: 1, modifiers: [{ label: 'Stab', attackBonus: 1, damageBonus: 0 }] });
    expect(computeAttackBonus(a, ctx(5))).toBe('+9');
  });
});

describe('Zauberzeile: Schaden', () => {
  it('Zaubertricks wachsen auf Stufe 5, 11 und 17 in der Würfelzahl', () => {
    const a = row(FIRE_BOLT);
    expect(computeAttackDamage(a, ctx(1))).toBe('1W10');
    expect(computeAttackDamage(a, ctx(5))).toBe('2W10');
    expect(computeAttackDamage(a, ctx(17))).toBe('4W10');
  });

  it('Schauriger Strahl wächst in der Zahl der Strahlen', () => {
    expect(computeAttackDamage(row(ELDRITCH), ctx(1))).toBe('1W10');
    expect(computeAttackDamage(row(ELDRITCH), ctx(11))).toBe('3× 1W10');
  });

  it('Höherer Grad legt Würfel oder Geschosse dazu', () => {
    expect(computeAttackDamage(row(FIREBALL), ctx(5))).toBe('8W6');
    expect(computeAttackDamage(row(FIREBALL, { spell: { key: 'fireball', ability: 'int', slotLevel: 5 } }), ctx(9))).toBe('10W6');
    expect(computeAttackDamage(row(MISSILE), ctx(5))).toBe('3× 1W4+1');
    expect(computeAttackDamage(row(MISSILE, { spell: { key: 'magic-missile', ability: 'int', slotLevel: 3 } }), ctx(5))).toBe('5× 1W4+1');
  });

  it('der Grad-Zuschlag trifft jeden Eintrag derselben Würfelgröße', () => {
    const up = (info: SpellInfo, slotLevel: number) => row(info, { spell: { key: info.key!, ability: 'int', slotLevel } });
    expect(computeAttackDamage(up(FLAME_STRIKE, 6), ctx(11))).toBe('6W6+6W6');
    expect(computeAttackDamage(up(ICE_STORM, 5), ctx(9))).toBe('3W10+4W6');
  });

  it('ein Grad unter dem Zaubergrad zählt wie der Zaubergrad', () => {
    expect(computeAttackDamage(row(FIREBALL, { spell: { key: 'fireball', ability: 'int', slotLevel: 1 } }), ctx(5))).toBe('8W6');
  });

  it('Spirituelle Waffe addiert das Zauberattribut zum Schaden', () => {
    expect(computeAttackDamage(row(SPIRITUAL), ctx(5))).toBe('1W8+4');
  });
});

describe('Zusatzwürfel aus Zaubern', () => {
  const weapon: Attack = { ...blankAttack(), name: 'Langbogen', ability: 'dex', baseDamage: '1d8' };

  it('Zeichen des Jägers gilt für Waffen und Zauberangriffe, nicht für Rettungswurf-Zauber', () => {
    const c = ctx(5, [HUNTERS_MARK]);
    const note = 'Zeichen des Jägers +1W6 Energieschaden: gegen das markierte Ziel';
    expect(attackDamageParts(weapon, c).notes).toContain(note);
    expect(attackDamageParts(row(FIRE_BOLT, {}, c), c).notes).toContain(note);
    expect(attackDamageParts(row(FIREBALL, {}, c), c).notes).not.toContain(note);
  });

  it('Göttliches Niederstrecken trifft keinen Fernkampf-Zauber', () => {
    const c = ctx(5, [DIVINE_SMITE]);
    expect(attackDamageParts(row(FIRE_BOLT, {}, c), c).notes.join()).not.toContain('Niederstrecken');
  });

  it('steht als Fußnote unter der Tabelle', () => {
    expect(attackFootnotes([], [{ name: HUNTERS_MARK.name, effects: spellRidersOf(HUNTERS_MARK) }]))
      .toEqual(['Zeichen des Jägers +1W6 Energieschaden: gegen das markierte Ziel']);
  });
});

describe('Steckbrief der Zauberkarte', () => {
  it('nennt Wurf, Schaden und Grad-Zuschlag', () => {
    expect(spellAttackSummary(3, FIREBALL.attack as never))
      .toBe('8W6 Feuer · Rettungswurf GES; gelungen: halber Schaden · Höherer Grad: +1W6 je Grad über 3');
    expect(spellAttackSummary(1, MISSILE.attack as never)).toMatch(/^3× 1W4\+1 Energie · Trifft ohne Wurf/);
  });
});

describe('Rückfall', () => {
  it('ein unbekannter oder kaputter Zauber zeigt die gespeicherten Werte', () => {
    const stored: Attack = { ...blankAttack(), name: 'Weg', bonus: '+5', damage: '2W6', spell: { key: 'gone', ability: 'int' } };
    expect(computeAttackBonus(stored, ctx(5))).toBe('+5');
    expect(computeAttackDamage(stored, ctx(5))).toBe('2W6');
    const broken = { ...stored, spell: { key: 'broken', ability: 'int' as const } };
    expect(computeAttackDamage(broken, ctx(5))).toBe('2W6');
  });

  it('ohne Zauberkontext (Bibliothek lädt noch) ebenso', () => {
    const a = row(FIRE_BOLT);
    const { spells: _, ...noSpells } = ctx(5);
    expect(computeAttackDamage({ ...a, damage: 'alt' }, noSpells)).toBe('alt');
  });
});

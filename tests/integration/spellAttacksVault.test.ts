/**
 * Zauber als Angriffe gegen den ECHTEN Vault: jede Auszeichnung parst, und die Prüflinge
 * bekommen ihre Angriffszauber und Zusatzwürfel angeboten.
 *
 *   npm run test -- spellAttacksVault
 */
import { describe, expect, it } from 'vitest';
import { buildSpellIndex, getSpellLibrary } from '../../src/lib/spellLibrary';
import { spellAttackSchema } from '../../src/lib/schemas/spellAttack';
import { attackEffectSchema } from '../../src/lib/schemas/attackEffect';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import {
  buildAttackFromSpell, spellAttackOptions, spellAttackSourceOf, spellRiderSources,
} from '../../src/lib/services/spellAttacks';
import { attackFootnotes } from '../../src/lib/services/attackEffects';
import type { AttackCalcContext } from '../../src/lib/services/attackCalc';
import { testCharacter } from '../support/testCharacter';

const index = async () => buildSpellIndex(await getSpellLibrary());

describe('Auszeichnung im Vault', () => {
  it('jeder `attack`- und `attackEffects`-Block parst', async () => {
    const bad = (await getSpellLibrary()).flatMap((s) => {
      const a = s.attack == null || spellAttackSchema.safeParse(s.attack).success;
      const r = s.attackEffects == null || attackEffectSchema.array().safeParse(s.attackEffects).success;
      return a && r ? [] : [s.name];
    });
    expect(bad).toEqual([]);
  });

  it('die bekannten Fälle sind ausgezeichnet', async () => {
    const lib = await getSpellLibrary();
    const en = (name: string) => lib.find((s) => s.name_en === name);
    expect(en('Fireball')?.attack).toMatchObject({ roll: 'save', save: 'dex', onSave: 'half' });
    expect(en('Fire Bolt')?.attack).toMatchObject({ roll: 'attack', range: 'ranged' });
    expect(en('Magic Missile')?.attack).toMatchObject({ roll: 'auto', count: 3 });
    expect(en("Hunter's Mark")?.attackEffects).toEqual([expect.objectContaining({ kind: 'dice', spellAttacks: true })]);
  });
});

describe('Prüflinge', () => {
  it('der Kleriker bekommt seine Schadenszauber angeboten, mit WEI als Zauberattribut', async () => {
    const c = testCharacter('Prüfling Kleriker');
    const { state } = await loadSpellcasting(c);
    const options = spellAttackOptions(state, await index());
    expect(options.map((o) => o.info.name_en)).toEqual(
      expect.arrayContaining(['Sacred Flame', 'Toll the Dead', 'Guiding Bolt']),
    );
    expect(options.every((o) => o.ability === 'wis')).toBe(true);
  });

  it('die Zeile der Heiligen Flamme rechnet den SG', async () => {
    const c = testCharacter('Prüfling Kleriker');
    const idx = await index();
    const { state } = await loadSpellcasting(c);
    const flame = spellAttackOptions(state, idx).find((o) => o.info.name_en === 'Sacred Flame')!;
    const ctx: AttackCalcContext = {
      strMod: 3, dexMod: 2, proficiencyBonus: 2,
      spells: { spellOf: spellAttackSourceOf(idx), mods: { str: 3, dex: 2, con: 2, int: 1, wis: 0, cha: -1 }, characterLevel: 1 },
    };
    const atk = buildAttackFromSpell(flame.info, 'wis', ctx);
    expect(atk).toMatchObject({ bonus: 'SG 10 GES', damage: '1W8', type: 'Gleißend' });
  });

  it('der Paladin bekommt seine Niederstrecken-Zauber als Fußnoten', async () => {
    const c = testCharacter('Prüfling Paladin');
    const { state } = await loadSpellcasting(c);
    const notes = attackFootnotes([], spellRiderSources(state, await index()));
    expect(notes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Strahlendes Niederstrecken \+2W6 Gleißender Schaden: nach einem Treffer/),
      expect.stringMatching(/\+2W6 Schallschaden: nach einem Treffer.*\(Nahkampf\)$/),
    ]));
  });
});

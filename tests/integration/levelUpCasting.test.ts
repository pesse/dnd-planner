/**
 * Zauberwirken-Anteil von `computeLevelUpDelta` (`levelUp.ts::spellcastingDelta`) gegen den
 * ECHTEN Vault — Stufe 4b: `casterKind`/`cantripDelta`/`preparedDelta`/`spellbook` kommen jetzt
 * aus `classCastingOffer` (Quotas), nicht mehr aus `cantripCount`/`preparedOrKnownCount`/
 * `isSpellbookClass` (Spaltenname bzw. Klassenname).
 *
 *   npm run test -- levelUpCasting
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { computeLevelUpDelta } from '../../src/lib/services/levelUp';
import { learnInfo } from '../../src/lib/services/levelUp/spells';

const charAt = (sourceKey: string, name: string, level: number) =>
  characterSchema.parse({ name: 'Testfigur', classes: [{ sourceKey, name, level }] });

describe('Zauberwirken-Delta des Aufstiegs, Stufe 1→2', () => {
  it('Magier: Zauberbuch-Regime, `learnInfo` fragt nach den neuen Buch-Einträgen', async () => {
    const delta = await computeLevelUpDelta(charAt('srd-2024_wizard', 'Magier', 1), 0, 2);
    expect(delta.casterKind).toBe('known');
    expect(delta.spellbook).toBe(true);
    expect(delta.preparedDelta).toBe(2); // Buch: base 6 + 2/Stufe
    expect(delta.cantripDelta).toBeGreaterThanOrEqual(0);
    expect(learnInfo(delta, []).learns).toBe(true);
  });

  it('Barde: `swap.spells==="level-up-one"` macht `casterKind` jetzt korrekt "known" (Nebenbefund-Fix)', async () => {
    const delta = await computeLevelUpDelta(charAt('srd-2024_bard', 'Barde', 1), 0, 2);
    expect(delta.casterKind).toBe('known');
    expect(delta.spellbook).toBe(false);
    const learn = learnInfo(delta, []);
    expect(learn.learns).toBe(true);
    expect(learn.count).toBe(delta.preparedDelta);
  });

  it('Kleriker: offene Liste (`long-rest-all`) bleibt ohne Lern-Frage', async () => {
    const delta = await computeLevelUpDelta(charAt('srd-2024_cleric', 'Kleriker', 1), 0, 2);
    expect(delta.casterKind).toBe('prepared');
    expect(delta.spellbook).toBe(false);
    expect(learnInfo(delta, []).learns).toBe(false);
  });

  it('Kämpfer: kein Zauberwirken, keine Nachricht „neu erlangt"', async () => {
    const delta = await computeLevelUpDelta(charAt('srd-2024_fighter', 'Kämpfer', 1), 0, 2);
    expect(delta.casterKind).toBe('none');
    expect(delta.castingIsNew).toBe(false);
    expect(learnInfo(delta, []).learns).toBe(false);
  });

  it('Druide 2→3: längst zaubernd, „neu erlangt" bleibt aus', async () => {
    const delta = await computeLevelUpDelta(charAt('srd-2024_druid', 'Druide', 2), 0, 3);
    expect(delta.castingIsNew).toBe(false);
  });
});

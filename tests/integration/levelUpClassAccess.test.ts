/**
 * Der Zauber-Zugang eines KLASSEN-/Subklassenmerkmals im Aufstieg — ohne LLM.
 *
 * Gegenstück zu `levelUpFeatAccess.test.ts`: dort bringt das neue Talent den Zugang mit, hier
 * ist das Merkmal längst erworben und nur sein Kontingent wächst.
 *
 *   npm run test -- levelUpClassAccess
 */
import { describe, expect, it } from 'vitest';
import { classAccessGrants } from '../../src/lib/services/levelUp/features';

const WIZARD = 'srd-2024_wizard';
const EVOKER = 'srd-2024_evoker';
const SAVANT = 'srd-2024_wizard_evoker_evocation-savant';

const spanTo = (fromLevel: number, toLevel: number) =>
  classAccessGrants({ sourceKey: WIZARD, subclassKey: EVOKER, fromLevel, toLevel });

describe('Zauber-Zugang eines Klassenmerkmals im Aufstieg (Magier/Hervorrufer)', () => {
  it('fragt beim Erwerb das ganze Kontingent', async () => {
    const grants = await spanTo(2, 3);
    expect(grants.map((g) => g.featureKey)).toEqual([SAVANT]);
    expect(grants[0].picks).toEqual([
      expect.objectContaining({ levels: [1, 2], schools: ['evocation'], tier: 'known', count: 2 }),
    ]);
  });

  /** Der Kern der Regression: ohne `fromLevel` fragte der Aufstieg alle drei noch einmal ab. */
  it('fragt beim Wachsen nur den Zuwachs', async () => {
    const grants = await spanTo(4, 5);
    expect(grants.map((g) => g.featureKey)).toEqual([SAVANT]);
    expect(grants[0].picks).toEqual([
      expect.objectContaining({ levels: [1, 2, 3], count: 1 }),
    ]);
  });

  it('fragt gar nicht, wo das Kontingent gleich bleibt', async () => {
    expect(await spanTo(3, 4)).toEqual([]);
  });

  /** Mehrere Stufen auf einmal: der Zuwachs ist die Differenz der Spanne, nicht je Stufe einer. */
  it('rechnet über eine Spanne mehrerer Stufen', async () => {
    const grants = await spanTo(4, 7);
    expect(grants[0].picks).toEqual([expect.objectContaining({ levels: [1, 2, 3, 4], count: 2 })]);
  });

  /** Vor der Subklassen-Wahl trägt das Delta sie noch nicht — sie kommt als Argument. */
  it('nimmt die JETZT gewählte Subklasse entgegen', async () => {
    const grants = await classAccessGrants(
      { sourceKey: WIZARD, subclassKey: '', fromLevel: 2, toLevel: 3 },
      EVOKER,
    );
    expect(grants.map((g) => g.featureKey)).toEqual([SAVANT]);
  });

  it('bleibt beim Magier ohne Subklasse stumm', async () => {
    expect(await classAccessGrants({ sourceKey: WIZARD, subclassKey: '', fromLevel: 4, toLevel: 5 })).toEqual([]);
  });
});

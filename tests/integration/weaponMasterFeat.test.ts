/**
 * Waffenbeherrschung aus einem Talent (Waffenmeister): ein Platz zusätzlich zur Klasse, auch
 * für Klassen ohne eigene Beherrschung.
 *
 *   npm run test -- weaponMasterFeat
 */
import { describe, expect, it } from 'vitest';
import { masteryOffer } from '../../src/lib/services/weaponMastery';

const WEAPON_MASTER = { sourceKey: 'phb-2024_weapon-master' };
const PROFS = { simpleWeapons: true, martialWeapons: true };

describe('Waffenbeherrschung aus dem Talent Waffenmeister', () => {
  it('gibt einer Klasse ohne Beherrschung einen Platz', async () => {
    const classes = [{ sourceKey: 'srd-2024_wizard', name: 'Magier', level: 4 }];
    expect((await masteryOffer({ classes, proficiencies: PROFS })).allowance).toBe(0);

    const offer = await masteryOffer({ classes, features: [WEAPON_MASTER], proficiencies: PROFS });
    expect(offer.allowance).toBe(1);
    expect(offer.weapons.length).toBeGreaterThan(0);
  });

  it('zählt zum Kontingent der Klasse hinzu und hebt die Nahkampf-Schranke auf', async () => {
    const classes = [{ sourceKey: 'srd-2024_barbarian', name: 'Barbar', level: 4 }];
    const base = await masteryOffer({ classes, proficiencies: PROFS });
    expect(base.meleeOnly).toBe(true);

    const offer = await masteryOffer({ classes, features: [WEAPON_MASTER], proficiencies: PROFS });
    expect(offer.allowance).toBe(base.allowance + 1);
    expect(offer.meleeOnly).toBe(false);
  });
});

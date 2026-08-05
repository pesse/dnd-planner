/**
 * Das Wizard-Angebot (`classCastingOffer`) gegen den ECHTEN Vault — Stufe 4b: der Wizard-
 * Schritt „Zauber" liest jetzt Quotas statt `spellcastingOffer()`.
 *
 *   npm run test -- classCastingOffer
 */
import { describe, expect, it } from 'vitest';
import { classCastingOffer } from '../../src/lib/services/wizard/classCastingOffer';

describe('Zauber-Angebot des Wizards je Klasse, Stufe 1', () => {
  it('Magier: Zauberbuch-Regime, Buch zieht die Vorbereitung', async () => {
    const offer = await classCastingOffer({ classKey: 'srd-2024_wizard', klasseName: 'Magier', level: 1 });
    expect(offer.isCaster).toBe(true);
    expect(offer.spellClass).toBe('wizard');
    expect(offer.cantrips?.count).toBeGreaterThan(0);
    expect(offer.cantrips?.levels).toEqual([0]);
    expect(offer.spells?.tier).toBe('known'); // das Zauberbuch
    expect(offer.spells?.count).toBe(6); // SPELLBOOK_START_SPELLS
    expect(offer.prepared).not.toBeNull();
    expect(offer.prepared?.pool.from?.quotaId).toBe(offer.spells?.quotaId);
  });

  it('Kleriker: offene Liste, keine Buch-Quota', async () => {
    const offer = await classCastingOffer({ classKey: 'srd-2024_cleric', klasseName: 'Kleriker', level: 1 });
    expect(offer.isCaster).toBe(true);
    expect(offer.spellClass).toBe('cleric');
    expect(offer.prepared).toBeNull();
    expect(offer.spells?.swap.spells).toBe('long-rest-all');
    expect(offer.spells?.count).toBeGreaterThan(0);
  });

  it('Barde: feste Liste, Tausch beim Stufenaufstieg', async () => {
    const offer = await classCastingOffer({ classKey: 'srd-2024_bard', klasseName: 'Barde', level: 1 });
    expect(offer.isCaster).toBe(true);
    expect(offer.prepared).toBeNull();
    expect(offer.spells?.swap.spells).toBe('level-up-one');
  });

  it('Hexenmeister: Paktmagie zählt als Zauber-Quota ohne Buch', async () => {
    const offer = await classCastingOffer({ classKey: 'srd-2024_warlock', klasseName: 'Hexenmeister', level: 1 });
    expect(offer.isCaster).toBe(true);
    expect(offer.prepared).toBeNull();
    expect(offer.spells?.cast.some((c) => c.kind === 'slots' && c.pool === 'pact')).toBe(true);
  });

  it('Kämpfer: kein Zauberwirken auf Stufe 1', async () => {
    const offer = await classCastingOffer({ classKey: 'srd-2024_fighter', klasseName: 'Kämpfer', level: 1 });
    expect(offer.isCaster).toBe(false);
    expect(offer.cantrips).toBeNull();
    expect(offer.spells).toBeNull();
  });

  it('ohne gewählte Klasse: leeres, nicht wirkendes Angebot', async () => {
    const offer = await classCastingOffer({ classKey: '', klasseName: '', level: 1 });
    expect(offer.isCaster).toBe(false);
  });
});

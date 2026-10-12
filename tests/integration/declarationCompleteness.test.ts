/**
 * Jedes Merkmal des ECHTEN Vaults ist redigiert, und keines kündigt eine Mechanik ohne
 * Deklaration an — bis auf die Rückstandslisten unten, die nur schrumpfen dürfen.
 *
 *   npm run test -- declarationCompleteness
 */
import { describe, expect, it } from 'vitest';
import { isRedacted } from '../../src/lib/services/declarationCoverage';
import { declarationGaps, type DeclarationGapKind } from '../../src/lib/services/declarationGap';
import { vaultFeatures } from '../support/vaultFeatures';

/** Undeklariert, mit Grund. Wer einen Eintrag deklariert, streicht ihn hier. */
const UNDECLARED_BACKLOG: Record<string, string> = {
  'srd-2024_barbarian_unarmored-defense': 'RK-Formel: keine RK-Berechnung',
  'srd-2024_monk_unarmored-defense': 'RK-Formel: keine RK-Berechnung',
  'srd-2024_defense': 'RK-Bonus: keine RK-Berechnung',
  'srd-2024_barbarian_fast-movement': 'Bewegungs-Bonus mit Rüstungsbedingung',
  'srd-2024_monk_unarmored-movement': 'Bewegungs-Bonus aus der Stufentabelle mit Rüstungsbedingung',
  'srd-2024_ranger_roving': 'Bewegungs-Bonus mit Rüstungsbedingung',
  'srd-2024_alert': 'Initiative-Bonus: keine Initiative-Berechnung',
  'srd-2024_human_versatile': 'Herkunftstalent zur Wahl: der Wizard hat keinen Talent-Picker nach Kategorie',
  'srd-2024_druid_circle-of-the-land_natures-ward': 'Vault-Datenfehler: trägt den Text von Nature’s Sanctuary',
  'srd-2024_druid_circle-of-the-land_natures-sanctuary': 'Vault-Datenfehler: trägt den Text von Natural Recovery',
};

const GAP_BACKLOG: Record<string, DeclarationGapKind> = {
  'srd-2024_warlock_eldritch-invocations': 'spells',
  'srd-2024_paladin_fighting-style': 'spells',
  'srd-2024_ranger_fighting-style': 'spells',
  'srd-2024_druid_circle-of-the-land_natures-sanctuary': 'resource',
  'srd-2024_human_versatile': 'choice',
};

describe('Deklarationen im Vault', () => {
  it('liest alle Merkmale', async () => {
    // Ein still verlorener Ladepfad ließe die Proben unten grün, ohne etwas gesehen zu haben.
    expect((await vaultFeatures()).length).toBeGreaterThan(300);
  });

  it('redigiert jedes Merkmal außerhalb des Rückstands', async () => {
    const undeclared = (await vaultFeatures()).filter((v) => !isRedacted(v.feature)).map((v) => v.id);
    expect(undeclared.filter((id) => !(id in UNDECLARED_BACKLOG)), 'neu undeklariert').toEqual([]);
    expect(Object.keys(UNDECLARED_BACKLOG).filter((id) => !undeclared.includes(id)), 'erledigt — aus dem Rückstand streichen').toEqual([]);
  });

  it('meldet keine Lücke außerhalb des Rückstands', async () => {
    const gaps = Object.fromEntries(
      (await vaultFeatures()).flatMap((v) => declarationGaps([v.feature]).map((g) => [v.id, g.kind] as const)),
    );
    const fresh = Object.entries(gaps).filter(([id, kind]) => GAP_BACKLOG[id] !== kind);
    expect(fresh, 'neue Lücke').toEqual([]);
    expect(Object.keys(GAP_BACKLOG).filter((id) => !(id in gaps)), 'erledigt — aus dem Rückstand streichen').toEqual([]);
  });
});

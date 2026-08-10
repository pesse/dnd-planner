/**
 * Der Umzug der Altform `spells` → `spellcasting`, gefahren gegen die Charakterdateien von
 * vor dem Umbau und gegen ihren heutigen Stand im Vault.
 *
 *   npm run test -- castingMigration
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { upgradeCharacter } from '../../src/lib/schemas/characterUpgrades';
import { vaultCharacter } from '../support/vaultCharacter';
import { spellsFix, type LegacyFix, type LegacyLinkLibraries, type LegacyLinkTarget } from '../../src/lib/services/characterLegacyLinks';
import { formDraftPatch, initialFormCarry, initialFormFields } from '../../src/lib/services/characterFormFields';
import { loadSheetSpellcasting, loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { LEGACY_CHARACTERS } from '../fixtures/legacyCharacterFiles';

const legacy = (name: string): Character =>
  characterSchema.parse(upgradeCharacter(structuredClone(LEGACY_CHARACTERS[name])).data);

/** Nur die Felder, die `spellsFix` anfasst. */
async function offer(c: Character): Promise<LegacyFix | undefined> {
  const casting = await loadSpellcasting(c);
  const target = {
    spells: c.spells,
    dropSpells: () => { delete c.spells; },
    spellcasting: c.spellcasting,
  } as LegacyLinkTarget;
  return spellsFix(target, { casting } as LegacyLinkLibraries);
}

async function migrate(c: Character): Promise<LegacyFix | undefined> {
  const fix = await offer(c);
  fix?.apply();
  return fix;
}

const sheetLabels = async (c: Character): Promise<string[]> =>
  (await loadSheetSpellcasting(c)).levels
    .flatMap((l) => l.spells.map((s) => s.label))
    .sort((a, b) => a.localeCompare(b, 'de'));

describe('Umzug der Altform', () => {
  it('stellt denselben Block her wie die Migration von Hand', async () => {
    for (const [name, vaultName] of [
      ['thromm', 'Thromm Flechtenstein'],
      ['silvara', 'Silvara/Sivral'],
      ['phoenix', 'Phönix'],
      ['carric', 'Carric Galanodel'],
    ]) {
      const c = legacy(name);
      await migrate(c);
      expect(c.spellcasting, name).toEqual(vaultCharacter(vaultName).spellcasting);
      expect(c.spells, name).toBeUndefined();
    }
  });

  it('lässt keinen Zauber vom Bogen verschwinden', async () => {
    for (const name of ['thromm', 'silvara', 'phoenix', 'carric']) {
      const c = legacy(name);
      const before = await sheetLabels(c);
      await migrate(c);
      expect(await sheetLabels(c), name).toEqual(before);
    }
  });

  it('legt gewährte Zauber nicht als Auswahl ab', async () => {
    const c = legacy('silvara');
    await migrate(c);
    const picks = Object.values(c.spellcasting.sources).flatMap((s) => Object.values(s.picks).flat());
    expect(picks).not.toContain('srd-2024_druidcraft');
    expect(picks).not.toContain('srd-2024_faerie-fire');
    expect(await sheetLabels(c)).toContain('Druidenkunst');
  });

  /**
   * Der Umzug schreibt das Attribut NICHT: es steht als Antwort im Merkmals-Ledger, und die
   * Auflösung liest es von dort. Eine Kopie in `spellcasting` liefe auseinander.
   */
  it('lässt das Attribut im Merkmals-Ledger stehen', async () => {
    const c = legacy('silvara');
    await migrate(c);
    expect(c.features.map((f) => f.choice)).toContain('Charisma');
    const { state } = await loadSpellcasting(c);
    const fairy = state.sources.find((s) => s.source.featureKey === 'phb-2024_fairy_fairy-magic');
    expect(fairy?.ability).toBe('Charisma');
  });

  it('nennt im Angebot die Zahl der Zauber und wiederholt sich nicht', async () => {
    const c = legacy('thromm');
    // Sieben, nicht acht: „Vertrauten finden" gewährt der Wilde Gefährte, es zieht nichts um.
    expect((await offer(c))?.label).toBe('7 Zauber ins neue Format übernehmen');
    await migrate(c);
    expect(await offer(c)).toBeUndefined();
  });

  it('hält Plätze ohne Progression von Hand', async () => {
    const c = legacy('carric');
    expect((await offer(c))?.label).toBe('2 Zauber und Zauberplätze ins neue Format übernehmen');
    await migrate(c);
    expect(c.spellcasting.manual?.slotTotals[2]).toBe(2);
  });
});

describe('Zauberbuch und Vorbereitung', () => {
  const wizard = (): Character =>
    characterSchema.parse({
      name: 'Prüfling',
      proficiencyBonus: 2,
      intMod: 3,
      classes: [{ sourceKey: 'srd-2024_wizard', name: 'Magier', level: 3 }],
      spells: {
        slots: [{ total: 4, used: 1 }, { total: 2, used: 0 }],
        cantrips: [{ name: 'Feuerpfeil' }],
        byLevel: {
          '1': [
            { name: 'Magisches Geschoss', prepared: true },
            { name: 'Schild', prepared: false },
          ],
        },
      },
    });

  it('legt jeden Zauber ins Buch, vorbereitet aber nur die vorbereiteten', async () => {
    const c = wizard();
    await migrate(c);
    const source = c.spellcasting.sources['srd-2024_wizard_spellcasting'];
    expect(source.picks.book).toEqual(['srd-2024_magic-missile', 'srd-2024_shield']);
    expect(source.picks.prepared).toEqual(['srd-2024_magic-missile']);
    expect(source.picks.cantrips).toEqual(['srd-2024_fire-bolt']);
  });

  it('übernimmt den Verbrauch der Plätze, nicht ihre Zahl', async () => {
    const c = wizard();
    await migrate(c);
    expect(c.spellcasting.pools.standard.used[0]).toBe(1);
    expect(c.spellcasting.manual?.slotTotals ?? []).toEqual([]);
  });
});

describe('Zauber ohne Bibliothekstreffer', () => {
  const homebrew = (): Character =>
    characterSchema.parse({
      name: 'Prüfling',
      classes: [{ sourceKey: 'srd-2024_wizard', name: 'Magier', level: 1 }],
      spells: { cantrips: [{ name: 'Otto von Ottos Ottifikation' }, { name: 'Feuerpfeil' }] },
    });

  it('lässt sie in der Altform stehen und sagt das im Angebot', async () => {
    const c = homebrew();
    expect((await offer(c))?.label).toBe('1 Zauber ins neue Format übernehmen (1 ohne Bibliothekstreffer bleiben stehen)');
    await migrate(c);
    expect(c.spells?.cantrips).toEqual([{ name: 'Otto von Ottos Ottifikation' }]);
    expect(await sheetLabels(c)).toContain('Otto von Ottos Ottifikation');
  });
});

describe('Speichern ohne Umzug', () => {
  it('nimmt einem noch nicht umgezogenen Charakter die Zauber nicht weg', () => {
    const c = legacy('thromm');
    Object.assign(c, formDraftPatch(initialFormFields(c), initialFormCarry(c)));
    expect(c.spells?.cantrips).toHaveLength(3);
    expect(c.spells?.byLevel['1']).toHaveLength(7);
  });
});

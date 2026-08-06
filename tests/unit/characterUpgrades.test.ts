/**
 * Was `_version` behauptet: dass jeder Schritt bis dorthin auf diesen Daten gelaufen IST.
 *
 *   npm run test -- characterUpgrades
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_UPGRADES,
  CHARACTER_VERSION,
  pendingCharacterUpgrade,
  upgradeCharacter,
} from '../../src/lib/schemas/characterUpgrades';

const versionOf = (data: Record<string, unknown>): unknown => data._version;

describe('Stempel der Schemaversion', () => {
  it('erreicht die aktuelle Version, wenn jeder Schritt greift', () => {
    const result = upgradeCharacter({ _version: 1, classLevel: 'Druide 3', race: 'Zwerg' });
    expect(result.failed).toBe('');
    expect(versionOf(result.data)).toBe(CHARACTER_VERSION);
    expect(result.applied.length).toBeGreaterThan(0);
  });

  // `references.feats` als String bringt Schritt 4 (`.map`) zu Fall.
  const broken = () => ({ _version: 3, references: { feats: 'kaputt' } });

  it('bleibt vor dem Schritt stehen, der scheitert', () => {
    const result = upgradeCharacter(broken());
    expect(result.failed).toBe('Talent-Referenzen → Merkmals-Ledger (references.feats → features)');
    expect(versionOf(result.data)).toBe(3);
    expect(result.applied).toEqual([]);
  });

  it('meldet den gescheiterten Schritt, obwohl er nichts geändert hat', () => {
    const pending = pendingCharacterUpgrade(broken());
    expect(pending?.failed).toBe('Talent-Referenzen → Merkmals-Ledger (references.feats → features)');
    expect(pending?.fromVersion).toBe(3);
    expect(pending?.toVersion).toBe(CHARACTER_VERSION);
  });

  it('nimmt den Schritt beim nächsten Laden wieder auf', () => {
    const once = upgradeCharacter(broken());
    const twice = upgradeCharacter(once.data);
    expect(twice.failed).toBe(once.failed);
  });

  it('hält einen aktuellen Charakter für fertig', () => {
    const current = upgradeCharacter({ _version: 1, classLevel: 'Magier 1' }).data;
    expect(pendingCharacterUpgrade(current)).toBeNull();
  });
});

describe('Schritt 7: Attribute deutsch-flach → englisch-verschachtelt', () => {
  const step7 = CHARACTER_UPGRADES.find((s) => s.to === 7)!;
  const expectedAbilities = { str: 12, dex: 14, con: 13, int: 10, wis: 8, cha: 15 };
  const expectedMods = { str: 1, dex: 2, con: 1, int: 0, wis: -1, cha: 2 };
  const expectedSaveProfs = { str: true, dex: false, con: true, int: false, wis: false, cha: false };

  it('verschachtelt einen rein deutsch-flachen Charakter', () => {
    const c = upgradeCharacter({
      _version: 6,
      str: 12, ges: 14, kon: 13, int: 10, wei: 8, cha: 15,
      strMod: 1, gesMod: 2, konMod: 1, intMod: 0, weiMod: -1, chaMod: 2,
      strSaveProf: true, gesSaveProf: false, konSaveProf: true,
      intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
      attacks: [{ name: 'Kurzschwert', ability: 'ges' }],
    }).data;
    expect(c.abilities).toEqual(expectedAbilities);
    expect(c.mods).toEqual(expectedMods);
    expect(c.saveProfs).toEqual(expectedSaveProfs);
    expect((c.attacks as { ability: string }[])[0].ability).toBe('dex');
    for (const oldField of ['str', 'ges', 'kon', 'int', 'wei', 'cha', 'strMod', 'gesMod', 'konMod', 'intMod', 'weiMod', 'chaMod', 'strSaveProf', 'gesSaveProf', 'konSaveProf', 'intSaveProf', 'weiSaveProf', 'chaSaveProf'])
      expect(c).not.toHaveProperty(oldField);
  });

  it('lässt einen schon englisch-verschachtelten Charakter unverändert', () => {
    const nested = {
      _version: 6,
      abilities: { ...expectedAbilities },
      mods: { ...expectedMods },
      saveProfs: { ...expectedSaveProfs },
      attacks: [{ name: 'Kurzschwert', ability: 'dex' }],
    };
    const c = upgradeCharacter(nested).data;
    expect(c.abilities).toEqual(expectedAbilities);
    expect(c.mods).toEqual(expectedMods);
    expect(c.saveProfs).toEqual(expectedSaveProfs);
    expect((c.attacks as { ability: string }[])[0].ability).toBe('dex');
  });

  it('mischt teilweise verschachtelte mit noch flachen Feldern', () => {
    const mixed = {
      _version: 6,
      abilities: { str: 12, dex: 14 },
      kon: 13, int: 10, wei: 8, cha: 15,
      mods: { str: 1 },
      gesMod: 2, konMod: 1, intMod: 0, weiMod: -1, chaMod: 2,
      saveProfs: { str: true },
      gesSaveProf: false, konSaveProf: true, intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
    };
    const c = upgradeCharacter(mixed).data;
    expect(c.abilities).toEqual(expectedAbilities);
    expect(c.mods).toEqual(expectedMods);
    expect(c.saveProfs).toEqual(expectedSaveProfs);
  });

  it('erfindet nichts, wenn gar keine Attributsfelder vorhanden sind', () => {
    const c = upgradeCharacter({ _version: 6, name: 'Leer' }).data;
    expect(c.abilities).toBeUndefined();
    expect(c.mods).toBeUndefined();
    expect(c.saveProfs).toBeUndefined();
  });

  it('ist bei zweifacher Anwendung idempotent', () => {
    const raw = {
      _version: 6,
      str: 12, ges: 14, kon: 13, int: 10, wei: 8, cha: 15,
      strMod: 1, gesMod: 2, konMod: 1, intMod: 0, weiMod: -1, chaMod: 2,
      strSaveProf: true, gesSaveProf: false, konSaveProf: true,
      intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
      attacks: [{ name: 'Kurzschwert', ability: 'ges' }],
    };
    const once = structuredClone(raw);
    step7.apply(once);
    const twice = structuredClone(once);
    step7.apply(twice);
    expect(twice).toEqual(once);
  });
});

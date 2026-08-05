/**
 * Was `_version` behauptet: dass jeder Schritt bis dorthin auf diesen Daten gelaufen IST.
 *
 *   npm run test -- characterUpgrades
 */
import { describe, expect, it } from 'vitest';
import {
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

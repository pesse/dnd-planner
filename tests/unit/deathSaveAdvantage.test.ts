/**
 * Vorteil auf Todesrettungswürfe (Widerstandsfähig, Der Überlebende) gehört an die
 * Todesrettungswürfe, nicht als Notiz an alle sechs Attributs-Rettungswürfe.
 *
 *   npm run test -- deathSaveAdvantage
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS } from '../../src/lib/schemas/abilities';
import { deathSaveAdvantage, savingThrowDerivations, type SavingThrowSource } from '../../src/lib/services/savingThrows';

const SOURCES: SavingThrowSource[] = [
  { labelDe: 'Widerstandsfähig', effect: { kind: 'advantage', abilities: [], deathSave: true } },
  { labelDe: 'Gnomische Gerissenheit', effect: { kind: 'advantage', abilities: ['int'] } },
];

const derivations = () => savingThrowDerivations({
  mods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  profBonus: 2,
  saveProfs: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
  sources: SOURCES,
});

describe('Vorteil auf Todesrettungswürfe', () => {
  it('nennt die Quelle an den Todesrettungswürfen', () => {
    expect(deathSaveAdvantage(SOURCES)).toEqual(['Widerstandsfähig']);
  });

  it('hängt nicht an den Attributs-Rettungswürfen', () => {
    const saves = derivations();
    for (const k of ABILITY_KEYS) expect(saves[k].notes.join()).not.toContain('Widerstandsfähig');
    expect(saves.int.notes).toEqual(['Vorteil (Gnomische Gerissenheit)']);
  });
});

import { describe, expect, it } from 'vitest';
import { featPrereqLevel, featPrereqMet, type FeatPrereqContext } from '$lib/services/featPrerequisites';

const ctx = (over: Partial<FeatPrereqContext> = {}): FeatPrereqContext => ({
  level: 4,
  ability: (k) => (k === 'dex' ? 14 : 10),
  spellcasting: false,
  fightingStyle: false,
  ...over,
});

describe('featPrereqMet', () => {
  it('lässt Talente ohne Voraussetzung zu', () => {
    expect(featPrereqMet('', ctx())).toBe(true);
  });

  it('prüft die Charakterstufe', () => {
    expect(featPrereqMet('Level 4+', ctx())).toBe(true);
    expect(featPrereqMet('Level 19+', ctx())).toBe(false);
  });

  it('verlangt jede Klausel, bei „or" aber nur eins der Attribute', () => {
    expect(featPrereqMet('Level 4+, Strength or Dexterity 13+', ctx())).toBe(true);
    expect(featPrereqMet('Level 4+, Strength 13+', ctx())).toBe(false);
  });

  it('prüft Zauberwirken und Kampfstil-Merkmal', () => {
    expect(featPrereqMet('Level 19+, Spellcasting Feature', ctx({ level: 19 }))).toBe(false);
    expect(featPrereqMet('Level 19+, Spellcasting Feature', ctx({ level: 19, spellcasting: true }))).toBe(true);
    expect(featPrereqMet('Fighting Style Feature', ctx())).toBe(false);
    expect(featPrereqMet('Fighting Style Feature', ctx({ fightingStyle: true }))).toBe(true);
  });

  it('sperrt unverständlichen Freitext nicht', () => {
    expect(featPrereqMet('Mitglied der Diebesgilde', ctx())).toBe(true);
  });

  it('liest die Mindeststufe, 0 ohne Stufenklausel', () => {
    expect(featPrereqLevel('Level 4+, Strength or Dexterity 13+')).toBe(4);
    expect(featPrereqLevel('Level 19+, Spellcasting Feature')).toBe(19);
    expect(featPrereqLevel('Fighting Style Feature')).toBe(0);
    expect(featPrereqLevel(undefined)).toBe(0);
  });
});

/**
 * Wirkzeit-Art, teures Material und wegfallende Komponenten einer Zauberzeile.
 *
 *   npm run test -- spellMarks
 */
import { describe, expect, it } from 'vitest';
import { componentWaiverSchema } from '../../src/lib/schemas/casting';
import { castTimeOf, costlyMaterial } from '../../src/lib/services/spellcasting/spellTraits';
import { waiverNote } from '../../src/lib/print/character/pages/spellMarks';
import { groupedSpell } from '../support/groupedSpell';

describe('castTimeOf', () => {
  it('erkennt Bonusaktion und Reaktion auch mit Auslöser', () => {
    expect(castTimeOf('Bonusaktion')).toBe('bonus');
    expect(castTimeOf('1 Bonusaktion')).toBe('bonus');
    expect(castTimeOf('Reaktion, die du ausführst, wenn du stürzt')).toBe('reaction');
    expect(castTimeOf('Aktion oder Ritual')).toBe('');
    expect(castTimeOf(undefined)).toBe('');
  });
});

describe('costlyMaterial', () => {
  it('zählt Preis oder Verbrauch, aber nur bei Materialkomponente', () => {
    expect(costlyMaterial({ components: 'VSM', materials: 'ein Diamant im Wert von mindestens 50 GM' })).toBe(true);
    expect(costlyMaterial({ components: 'VSM', materials: '2 Kupfermünzen, die der Zauber verbraucht' })).toBe(true);
    expect(costlyMaterial({ components: 'VSM', materials: 'eine Prise Schwefel' })).toBe(false);
    expect(costlyMaterial({ components: 'VS', materials: 'im Wert von 50 GM' })).toBe(false);
  });
});

describe('waiverNote', () => {
  const waiver = (raw: unknown) => componentWaiverSchema.parse(raw);

  it('nennt nur Komponenten, die der Zauber hat', () => {
    const spell = groupedSpell({ key: 'k', label: 'K', level: 1, components: 'VM' });
    expect(waiverNote(spell, [waiver({ omit: ['verbal', 'somatic'] })])).toBe('ohne V');
  });

  it('behält teures Material, wo die Regel es verlangt, und nennt die Bedingung', () => {
    const spell = groupedSpell({ key: 'k', label: 'K', level: 2, components: 'VSM', costlyMaterial: true });
    const note = waiverNote(spell, [waiver({
      omit: ['verbal', 'somatic', 'material'], keepCostlyMaterial: true, whenDe: 'über Zaubereipunkte',
    })]);
    expect(note).toBe('über Zaubereipunkte ohne V, S');
  });

  it('greift nur bei den genannten Schulen', () => {
    const waivers = [waiver({ omit: ['verbal'], schools: ['illusion'] })];
    expect(waiverNote(groupedSpell({ key: 'a', label: 'A', level: 1, components: 'V', school: 'evocation' }), waivers)).toBe('');
    expect(waiverNote(groupedSpell({ key: 'b', label: 'B', level: 1, components: 'V', school: 'illusion' }), waivers)).toBe('ohne V');
  });
});

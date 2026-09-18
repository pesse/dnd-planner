/**
 * Der Schnitt zwischen Merkmals- und Options-Text. Was hier geprüft wird, ist die Grenze:
 * Absätze, die eine Option ausbuchstabieren, fallen weg — Absätze, die zum Merkmal gehören,
 * bleiben, auch wenn sie zwischen den Optionen stünden.
 *
 *   npm run test -- featureText
 */
import { describe, expect, it } from 'vitest';
import { featureNote, textWithoutOptions } from '../../src/lib/services/featureText';

const COMBAT_SUPERIORITY = [
  'Deine Erfahrung hat deine Techniken geschärft. Du erhältst folgende Vorzüge:',
  '**Überlegenheitswürfel.** Du hast vier Überlegenheitswürfel, und zwar W8.',
  '**Rettungswürfe.** Verlangt ein Manöver einen Rettungswurf, beträgt der SG 8 plus …',
  '**Hinterhalt.** Wenn du einen Heimlichkeits-Wurf machst …',
  '**Riposte.** Wenn eine Kreatur dich verfehlt …',
].join('\n\n');

describe('Merkmalstext ohne die Optionsabsätze', () => {
  it('schneidet ab dem ersten Options-Absatz', () => {
    const text = textWithoutOptions(COMBAT_SUPERIORITY, ['Hinterhalt', 'Riposte']);
    expect(text).toContain('Überlegenheitswürfel');
    expect(text).toContain('Rettungswürfe');
    expect(text).not.toContain('Hinterhalt');
    expect(text).not.toContain('Riposte');
  });

  it('lässt den ganzen Text stehen, wenn keine Option darin vorkommt', () => {
    expect(textWithoutOptions(COMBAT_SUPERIORITY, ['Parieren'])).toBe(COMBAT_SUPERIORITY);
    expect(textWithoutOptions(COMBAT_SUPERIORITY, [])).toBe(COMBAT_SUPERIORITY);
  });

  it('trifft beide Fettschreibweisen und ignoriert Groß-/Kleinschreibung', () => {
    const en = 'You gain the following benefits.\n\n***Ambush.*** When you roll Initiative …';
    expect(textWithoutOptions(en, ['ambush'])).toBe('You gain the following benefits.');
  });

  /** Ein Absatz, der nur so ANFÄNGT wie eine Option, ist keiner — geschnitten wird am Lead. */
  it('schneidet nur an der Fettmarke, nicht an beliebigem Vorkommen', () => {
    const desc = 'Du kannst einen Hinterhalt legen.\n\n**Hinterhalt.** Die Option selbst.';
    expect(textWithoutOptions(desc, ['Hinterhalt'])).toBe('Du kannst einen Hinterhalt legen.');
  });
});

describe('Notiz zur Frage', () => {
  it('nimmt Deutsch, wo es der Vault führt', () => {
    const note = featureNote({ name: 'Combat Superiority', nameDe: 'Kampfüberlegenheit', desc: 'EN', descDe: 'DE' });
    expect(note).toEqual({ titleDe: 'Kampfüberlegenheit', text: 'DE' });
  });

  it('fällt auf Englisch zurück und meldet leere Merkmale als nichts', () => {
    expect(featureNote({ name: 'Ambush', desc: 'EN only' })?.text).toBe('EN only');
    expect(featureNote({ name: 'Leer', desc: '  ' })).toBeNull();
    expect(featureNote(undefined)).toBeNull();
  });
});

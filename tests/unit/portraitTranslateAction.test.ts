/**
 * Übersetzungs-Aufruf fürs Portrait: nur gefüllte Felder gehen ans Modell.
 *
 *   npm run test -- portraitTranslateAction
 */
import { describe, expect, it } from 'vitest';
import { buildPortraitTranslateAction, buildPortraitTranslateInput } from '../../src/lib/services/aiActions/portraitTranslateAction';

describe('buildPortraitTranslateInput', () => {
  it('lässt leere Felder weg', () => {
    const input = buildPortraitTranslateInput({ skin: 'hell', hair: '  ', extra: '' });
    expect(JSON.parse(input.replace(/<\/?source_de>/g, ''))).toEqual({ skin: 'hell' });
  });
});

describe('buildPortraitTranslateAction', () => {
  it('ist tool-frei und füllt fehlende Felder mit ""', () => {
    const action = buildPortraitTranslateAction();
    expect(action.openAiTools).toEqual([]);
    expect(action.validate({ skin: 'fair' })).toBe(true);
  });
});

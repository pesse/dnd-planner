/**
 * Eine Pflichtfrage ohne Optionen blockiert den Checkpoint dauerhaft: leerer Picker, „Weiter"
 * bleibt aus (`allBaseAnswered`). Die KI-Deutung erzeugt genau das, wo die Optionen erst zur
 * Laufzeit entstehen — sie kennt den Charakter nicht.
 *
 *   npm run test -- optionlessQuestion
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisChoice } from '../../src/lib/services/analysis/types';
import { buildFeatureChoices } from '../../src/lib/services/levelUp/questions';

const choice = (over: Partial<AnalysisChoice>): AnalysisChoice => ({
  id: 'c1', feature: 'F', featureDe: 'F', featureKey: 'test_f',
  question: 'Choose', questionDe: 'Wähle', help: '', helpDe: '',
  type: 'choice', options: [], optionsDe: [], optionHelp: {}, optionHelpDe: {},
  spellLevels: [], spellClass: '', spellSchools: [], sourceId: '', quotaId: '',
  max: 1, determinesFurtherEffects: false, isBuildDecision: true, ...over,
});

describe('optionslose Wahlen', () => {
  it('lässt eine optionslose Auswahlfrage ganz weg', () => {
    expect(buildFeatureChoices([choice({ type: 'choice' })])).toEqual([]);
    expect(buildFeatureChoices([choice({ type: 'multiselect', max: 2 })])).toEqual([]);
  });

  it('lässt die übrigen Fragen desselben Aufstiegs stehen', () => {
    const qs = buildFeatureChoices([
      choice({ id: 'leer', type: 'multiselect' }),
      choice({ id: 'voll', type: 'choice', options: ['A', 'B'], optionsDe: ['A', 'B'] }),
    ]);
    expect(qs.map((q) => q.id)).toEqual(['voll']);
    expect(qs[0].required, 'die beantwortbare Frage bleibt Pflicht').toBe(true);
  });

  it('behält Frageformen, die ihre Eingabe nicht aus `options` beziehen', () => {
    // Freitext (Sprachen) und Zauber-Picker (Bibliothek) sind ohne Optionen vollständig.
    expect(buildFeatureChoices([choice({ type: 'text' })]).map((q) => q.type)).toEqual(['text']);
    expect(buildFeatureChoices([choice({ type: 'spell-pick', spellLevels: [1], spellClass: 'wizard' })])
      .map((q) => q.type)).toEqual(['spell-picker']);
  });
});

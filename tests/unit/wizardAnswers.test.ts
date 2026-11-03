/**
 * Der Wizard behält Antworten über einen Wechsel der Grundwahl hinweg; in den Charakter geht
 * nur, was die GERADE angebotenen Wahlen tragen.
 *
 *   npm run test -- wizardAnswers
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisChoice } from '../../src/lib/services/analysis/types';
import { wizardAnswers } from '../../src/lib/services/wizard/wizardChoices';

const choice = (over: Partial<AnalysisChoice>): AnalysisChoice => ({
  id: 'c1', feature: 'F', featureDe: 'F', featureKey: 'test_f',
  question: 'Choose', questionDe: 'Wähle', helpDe: '',
  type: 'choice', options: [], optionsDe: [], optionHelpDe: {},
  spellLevels: [], spellClass: '', spellSchools: [], spellTier: 'prepared', sourceId: '', quotaId: '',
  max: 1, isBuildDecision: true, ...over,
});

const noSpells = () => '';

describe('Antworten des Wizards', () => {
  it('übergeht Antworten auf Wahlen, die es nicht mehr gibt', () => {
    const raw = { order: ['Protector'], gone: ['Thaumaturge'] };
    const answers = wizardAnswers([choice({ id: 'order', options: ['Protector', 'Thaumaturge'] })], raw, noSpells);
    expect(answers).toEqual([{ id: 'order', choice: 'Protector' }]);
  });

  it('verwirft eine Option, die die Wahl nicht mehr anbietet', () => {
    // Expertise auf einer Fertigkeit, die nach dem Klassenwechsel nicht mehr geübt ist.
    const ch = choice({ id: 'exp', type: 'multiselect', max: 2, options: ['Stealth', 'Arcana'] });
    expect(wizardAnswers([ch], { exp: ['Athletics', 'Stealth'] }, noSpells)).toEqual([{ id: 'exp', choice: 'Stealth' }]);
    expect(wizardAnswers([ch], { exp: ['Athletics'] }, noSpells)).toEqual([]);
  });

  it('kappt eine Mehrfachwahl auf ihr Maximum', () => {
    const ch = choice({ id: 'm', type: 'multiselect', max: 1, options: ['A', 'B'] });
    expect(wizardAnswers([ch], { m: ['A', 'B'] }, noSpells)).toEqual([{ id: 'm', choice: 'A' }]);
  });

  it('lässt Freitext und optionslose Wahlen unangetastet', () => {
    const answers = wizardAnswers(
      [choice({ id: 't', type: 'text' }), choice({ id: 'tool', options: [] })],
      { t: ['Ein Name'], tool: ['Kalligrafiewerkzeug'] },
      noSpells,
    );
    expect(answers.map((a) => a.choice)).toEqual(['Ein Name', 'Kalligrafiewerkzeug']);
  });

  it('nimmt den Antworttext einer Zauber-Wahl vom Aufrufer', () => {
    const ch = choice({ id: 'sp', type: 'spell-pick' });
    expect(wizardAnswers([ch], {}, () => 'Licht')).toEqual([{ id: 'sp', choice: 'Licht' }]);
  });
});

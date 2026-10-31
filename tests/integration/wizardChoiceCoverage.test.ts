/**
 * Wizard und Merkmalsleiste gegen den ECHTEN Vault: Wer im Wizard jede gestellte Frage
 * beantwortet, darf danach in der Merkmalsleiste keine offene Entscheidung mehr finden.
 *
 *   npm run test -- wizardChoiceCoverage
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import { buildFeaturePrep, type FeatureBasics } from '../../src/lib/services/wizard/featurePrep';
import { wizardDeclaredChoices } from '../../src/lib/services/wizard/wizardChoices';
import { applyFeatureLedger, applyLinks, type WizardCastingSource } from '../../src/lib/services/wizard/castingDraft';
import { buildCharacterChoices, collectChoiceSlots } from '../../src/lib/services/characterChoices';
import type { AnalysisChoice } from '../../src/lib/services/analysis/types';
import type { DeclaredAnswer } from '../../src/lib/services/declaredChoice';

const SPECIES = [
  'phb-2024_aasimar', 'srd-2024_dragonborn', 'srd-2024_dwarf', 'srd-2024_elf', 'homebrew-sam_fairy',
  'srd-2024_gnome', 'srd-2024_goliath', 'srd-2024_halfling', 'srd-2024_human', 'srd-2024_orc',
  'srd-2024_tiefling',
];

const basicsOf = (species: string): FeatureBasics => ({
  species: { sourceKey: species, name: species },
  klass: { sourceKey: 'srd-2024_sorcerer', name: 'Zauberer' },
  background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
});

/** Was ein Spieler mindestens anklickt: die ersten zulässigen Optionen, sonst Freitext. */
const firstAnswer = (ch: AnalysisChoice): string =>
  ch.options.length ? ch.options.slice(0, Math.max(1, ch.max)).join(', ') : 'Elbisch';

/** Antwortet, bis keine neue Frage mehr auftaucht — eine Zweigwahl kann weitere nach sich ziehen. */
function answerEverything(params: Omit<Parameters<typeof wizardDeclaredChoices>[0], 'declaredAnswers'>) {
  const answers: DeclaredAnswer[] = [];
  for (;;) {
    const choices = wizardDeclaredChoices({ ...params, declaredAnswers: answers });
    const fresh = choices.filter((ch) => ch.type !== 'spell-pick' && !answers.some((a) => a.id === ch.id));
    if (!fresh.length) return { choices, answers };
    answers.push(...fresh.map((ch) => ({ id: ch.id, choice: firstAnswer(ch) })));
  }
}

describe('Wizard stellt jede Wahl, die die Merkmalsleiste erwartet', () => {
  it.each(SPECIES)('%s: nach dem Wizard ist nichts mehr offen', async (species) => {
    const basics = basicsOf(species);
    const prep = await buildFeaturePrep(basics);
    const { choices, answers } = answerEverything({
      spellAccess: prep.spellAccess,
      declared: prep.declared,
      proficientSkills: [],
      sizeChoice: prep.sizeChoice,
      tools: [],
    });

    const c = characterSchema.parse({ name: 'Prüfling Wizard' });
    const source = {
      ...basics,
      declaredChoices: choices,
      declaredAnswers: answers,
    } as unknown as WizardCastingSource;
    applyLinks(c, source);
    applyFeatureLedger(c, source);

    const { slots } = await collectChoiceSlots(c);
    const open = buildCharacterChoices(slots, { proficient: [], ledger: c.features })
      .filter((ch) => ch.open)
      .map((ch) => `${ch.choice.featureDe}: ${ch.choice.questionDe}`);
    expect(open).toEqual([]);
  });
});

/**
 * Merkmalswahlen stehen im Wizard-Schritt dessen, was sie mitbringt: Hintergrund-Talent beim
 * Hintergrund, Volks-Talent beim Volks-Talent, der Rest unter „Merkmale".
 *
 *   npm run test -- wizardChoiceOwners
 */
import { describe, expect, it } from 'vitest';
import { buildFeaturePrep, type FeatureBasics } from '../../src/lib/services/wizard/featurePrep';
import { wizardDeclaredChoices } from '../../src/lib/services/wizard/wizardChoices';
import { BACKGROUND_OWNER, choiceOwnerOf, ownedSpellAccessFacts } from '../../src/lib/services/wizard/choiceOwners';

const VERSATILE = 'srd-2024_human_versatile';
const MAGIC_INITIATE = 'srd-2024_magic-initiate';

async function owners(basics: FeatureBasics): Promise<Record<string, string[]>> {
  const prep = await buildFeaturePrep(basics);
  const choices = wizardDeclaredChoices({
    spellAccess: prep.spellAccess, declaredAnswers: [], declared: prep.declared,
    proficientSkills: [], proficientSaves: [], sizeChoice: prep.sizeChoice, tools: [],
  }).filter((c) => c.type !== 'spell-pick');
  const ownerOf = choiceOwnerOf({ backgroundKey: basics.background.sourceKey, featOwners: prep.featOwners, spellAccess: prep.spellAccess });
  const out: Record<string, string[]> = {};
  for (const c of choices) (out[ownerOf(c)] ??= []).push(`${c.featureKey}:${c.questionDe}`);
  return out;
}

const human = { sourceKey: 'srd-2024_human', name: 'Mensch' };
const noClass = { sourceKey: '', name: '' };

describe('Wizard-Schritt einer Merkmalswahl', () => {
  it('fragt das Zauberattribut des Hintergrund-Talents beim Hintergrund, auch vor der Klassenwahl', async () => {
    const o = await owners({ species: human, klass: noClass, background: { sourceKey: 'srd-2024_acolyte', name: 'Akolyth' } });
    expect(o[BACKGROUND_OWNER]).toEqual([`${MAGIC_INITIATE}:Zauberattribut`]);
  });

  it('fragt beim zweiten Exemplar über Vielseitig Liste und Attribut beim Volks-Talent', async () => {
    const o = await owners({
      species: human, klass: noClass, background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
      traitFeats: [{ key: MAGIC_INITIATE, grantedBy: VERSATILE }],
    });
    expect(o[BACKGROUND_OWNER]).toEqual([`${MAGIC_INITIATE}:Zauberattribut`]);
    expect(o[VERSATILE]).toEqual([`${MAGIC_INITIATE}:Zauberliste`, `${MAGIC_INITIATE}:Zauberattribut`]);
  });

  it('fragt die Werkzeugwahl beim Hintergrund und lässt die des Volks unter „Merkmale"', async () => {
    const o = await owners({
      species: human, klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
      background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
    });
    expect(o[BACKGROUND_OWNER]).toEqual(['srd-2024_soldier:Soldat: Wähle ein Werkzeug']);
    expect(o['']).toEqual(['srd-2024_human_size:Größenkategorie']);
  });

  it('nennt die Zauberliste, die der Akolyth festlegt, statt sie zu verschweigen', async () => {
    const prep = await buildFeaturePrep({ species: human, klass: noClass, background: { sourceKey: 'srd-2024_acolyte', name: 'Akolyth' } });
    const facts = ownedSpellAccessFacts(BACKGROUND_OWNER, prep.featOwners, prep.spellAccess);
    expect(facts.map((f) => [f.part, f.valueDe, f.fromSource])).toEqual([['list', 'Kleriker', true]]);
  });
});

/**
 * Talente, deren Zauberattribut das erhöhte Attribut ist (Feenberührt & Co.): keine eigene
 * Attributfrage, die Antwort der Attributserhöhung legt es fest.
 *
 *   npm run test -- spellAbilityFromIncrease
 */
import { describe, expect, it } from 'vitest';
import { getFeats } from '../../src/lib/featsLibrary';
import { abilityIncreaseChoiceId, abilityIncreaseRefs } from '../../src/lib/services/declaration/abilityIncrease';
import {
  answeredAbility,
  spellAccessFacts,
  spellAccessGrantOf,
  spellAccessNoteLines,
  spellAccessParts,
  type SpellAccessGrant,
} from '../../src/lib/services/spellcasting/access';

const FEY_TOUCHED_KEY = 'phb-2024_fey-touched';

const feyTouched = async () => {
  const feat = (await getFeats()).find((f) => f.sourceKey === FEY_TOUCHED_KEY);
  if (!feat) throw new Error(`${FEY_TOUCHED_KEY} fehlt im Vault`);
  return feat;
};

const grantOf = async (): Promise<SpellAccessGrant> => {
  const feat = await feyTouched();
  const grant = spellAccessGrantOf({
    key: feat.sourceKey,
    name: feat.name,
    nameDe: feat.nameDe,
    grantsChoice: feat.grantsChoice,
    grantsCasting: feat.grantsCasting,
  });
  if (!grant) throw new Error('Feenberührt deklariert keinen Zauber-Zugang');
  return grant;
};

describe('Zauberattribut aus der Attributserhöhung', () => {
  it('stellt keine eigene Attributfrage', async () => {
    const grant = await grantOf();
    expect(spellAccessParts(grant)).not.toContain('ability');
    expect(spellAccessFacts(grant).find((f) => f.part === 'ability')?.valueDe).toBe('das erhöhte Attribut');
  });

  it('liest das Attribut aus der Antwort der Attributserhöhung', async () => {
    const grant = await grantOf();
    const feat = await feyTouched();
    const [ref] = abilityIncreaseRefs({ ...feat, key: feat.sourceKey });
    expect(grant.abilityAnswerId).toBe(abilityIncreaseChoiceId(ref));

    const [line] = spellAccessNoteLines([grant], { [abilityIncreaseChoiceId(ref)]: 'Wisdom' });
    expect(line).toContain('Weisheit');
    expect(answeredAbility(grant, [{ sourceKey: FEY_TOUCHED_KEY, choice: 'Wisdom' }])).toBe('Wisdom');
  });
});

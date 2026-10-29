/**
 * „Übung, bist du schon geübt, Expertise" (Scharfer Verstand, Aufmerksam): die Wahl reist als
 * `orExpertise`, entschieden wird erst gegen den Übungsstand des Charakters.
 *
 *   npm run test -- skillOrExpertise
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { getFeats } from '../../src/lib/featsLibrary';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { skillSheetKey } from '../../src/lib/domain/skills';
import { optionListRefs, optionListRider } from '../../src/lib/services/declaration/optionList';
import { riderGrantChanges } from '../../src/lib/services/levelUp/changes';

const KEEN_MIND = 'phb-2024_keen-mind';
const ARCANA = skillSheetKey('Arcana');

const keenMindChanges = async (answer: string) => {
  const feat = (await getFeats()).find((f) => f.sourceKey === KEEN_MIND);
  if (!feat) throw new Error(`${KEEN_MIND} fehlt im Vault`);
  const [ref] = optionListRefs({ ...feat, key: feat.sourceKey });
  const rider = optionListRider(ref, answer, 4);
  if (!rider) throw new Error('Option ohne Rider');
  return riderGrantChanges([rider], { step: 'assemble-decisions', source: KEEN_MIND });
};

const withArcana = (prof: boolean): Character => {
  const c = characterSchema.parse({ name: 'Prüfling' });
  c.skills[ARCANA] = { ...c.skills[ARCANA], prof, exp: false };
  return c;
};

describe('Übung oder Expertise aus einer Talent-Option', () => {
  it('gibt Übung, wenn der Charakter noch nicht geübt ist', async () => {
    const c = withArcana(false);
    applyChanges(c, await keenMindChanges('Arcana'), { classIndex: 0 });
    expect(c.skills[ARCANA]).toMatchObject({ prof: true, exp: false });
  });

  it('gibt Expertise, wenn er schon geübt ist', async () => {
    const c = withArcana(true);
    applyChanges(c, await keenMindChanges('Arcana'), { classIndex: 0 });
    expect(c.skills[ARCANA]).toMatchObject({ prof: true, exp: true });
  });
});

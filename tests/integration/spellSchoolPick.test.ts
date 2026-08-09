/**
 * Der Schul-Filter einer Zauber-Wahl (`pool.schools`) — OHNE LLM.
 *
 * „Choose two Wizard spells from the Evocation school" ist eine Schranke des Pools, keine
 * Empfehlung: der Hervorrufer bekam bis dahin die ganze Magier-Liste angeboten. Geprüft wird
 * beides, was die Schranke trägt — die Frage des Aufstiegs und der Dialog des Zauber-Blocks.
 *
 *   npm run test -- spellSchoolPick
 */
import { describe, expect, it } from 'vitest';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { getSpellLibrary } from '../../src/lib/spellLibrary';
import { spellAccessChoices, spellAccessGrantOf } from '../../src/lib/services/spellcasting/access';
import { buildFeatureChoices } from '../../src/lib/services/levelUp/questions';
import { pickLibrary } from '../../src/lib/services/spellcasting/picker';
import type { SpellQuotaGroup } from '../../src/lib/services/spellcasting/grouped';

const EVOKER_KEY = 'srd-2024_evoker';
const SAVANT_KEY = 'srd-2024_wizard_evoker_evocation-savant';

const savantGrant = async (level: number) => {
  const prog = await getProgressionByKey(EVOKER_KEY);
  const feature = prog?.features.find((f) => f.key === SAVANT_KEY);
  expect(feature, `${SAVANT_KEY} im Vault`).toBeTruthy();
  const grant = spellAccessGrantOf({ ...feature!, key: feature!.key }, { level });
  expect(grant, `${SAVANT_KEY}: Deklaration lesbar`).not.toBeNull();
  return grant!;
};

const quotaGroup = (schools: SpellQuotaGroup['schools']): SpellQuotaGroup => ({
  sourceId: SAVANT_KEY, quotaId: 'evocation-book', label: 'Zauberbuch',
  cast: [], castNote: '', swapNote: '', levels: [1, 2], lists: ['wizard'], schools,
  from: null, into: null, count: 2, fixed: false, spells: [], open: 2,
});

describe('Hervorrufer: Zauberbuch-Wahl nur aus der Hervorrufungsschule', () => {
  it('staffelt Kontingent und Grade an der Klassenstufe', async () => {
    // Stufe 3: zwei Zauber bis Grad 2. Danach je neuem Platz-Grad einer mehr.
    expect((await savantGrant(3)).picks).toEqual([
      { level: 1, levels: [1, 2], schools: ['evocation'], tier: 'known', count: 2, sourceId: SAVANT_KEY, quotaId: 'evocation-book' },
    ]);
    expect((await savantGrant(5)).picks[0]).toMatchObject({ levels: [1, 2, 3], count: 3 });
    expect((await savantGrant(20)).picks[0]).toMatchObject({ levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], count: 9 });
  });

  it('trägt die Schule bis in die Frage des Aufstiegs', async () => {
    const choices = spellAccessChoices(await savantGrant(3));
    // Die Liste steht fest (Magier), also entsteht sofort die Zauber-Wahl — keine Listenfrage.
    expect(choices.map((c) => c.type)).toEqual(['spell-pick']);
    expect(choices[0].spellSchools).toEqual(['evocation']);
    expect(choices[0].questionDe).toBe('2 Zauber der Grade 1–2 aus der Schule Hervorrufung wählen');

    const [question] = buildFeatureChoices(choices);
    expect(question.type).toBe('spell-picker');
    expect(question.spellSchools).toEqual(['evocation']);
    expect(question.spellLevels).toEqual([1, 2]);
  });

  it('engt den Dialog des Zauber-Blocks auf die Schule ein', async () => {
    const library = await getSpellLibrary();
    expect(library.length, 'Vault-Shim aktiv?').toBeGreaterThan(100);

    const all = pickLibrary(quotaGroup([]), library);
    const evocation = pickLibrary(quotaGroup(['evocation']), library);
    expect(all).toBe(library);
    expect(evocation.length).toBeGreaterThan(0);
    expect(evocation.length).toBeLessThan(library.length);
    expect(evocation.every((s) => s.school === 'evocation')).toBe(true);
  });
});

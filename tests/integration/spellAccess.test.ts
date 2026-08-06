/**
 * Deterministischer Test des deklarierten Zauber-Zugangs — OHNE LLM.
 *
 * Er sichert genau die Zuständigkeitsgrenze ab, die Stufe 1 gezogen hat: Zauberliste,
 * Zauberattribut und Kontingent des „Eingeweihten der Magie" kommen aus `vault/feats/magic-initiate.json`
 * (`grantsChoice.kind === "spellAccess"`), nicht aus der Merkmalsdeutung — und das Talent
 * verschwindet dafür aus dem KI-Eingang, ohne aus dem deutschen Merkmalstext zu fallen.
 *
 *   npm run test -- spellAccess
 */
import { describe, expect, it } from 'vitest';
import { getFeats } from '../../src/lib/featsLibrary';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import {
  spellAccessChoices,
  spellListChoiceId,
  withoutSpellAccessFeatures,
  type SpellAccessGrant,
} from '../../src/lib/services/spellcasting/access';
import {
  GNOME_SORCERER_BASICS,
  MAGIC_INITIATE_CANTRIPS,
  MAGIC_INITIATE_KEY,
  MAGIC_INITIATE_LEVEL1,
  MAGIC_INITIATE_LIST,
} from '../fixtures/gnome-sorcerer-sage';

/** Ein Nicht-Zauberwirker mit Akolyth: dieselbe Deklaration, andere Liste (Kleriker). */
const FIGHTER_ACOLYTE = {
  species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
  klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
  background: { sourceKey: 'srd-2024_acolyte', name: 'Akolyth' },
} as const;

/** Der deutsche Name kommt aus dem Vault — eine Umbenennung im Inhalt ist kein Testbruch. */
const magicInitiateDe = async (): Promise<string> => {
  const feat = (await getFeats()).find((f) => f.sourceKey === MAGIC_INITIATE_KEY);
  if (!feat?.nameDe) throw new Error(`${MAGIC_INITIATE_KEY} fehlt im Vault oder hat kein nameDe`);
  return feat.nameDe;
};

describe('deklarierter Zauber-Zugang (Eingeweihter der Magie)', () => {
  it('liest Liste, Attribut und Kontingent aus dem Vault', async () => {
    const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
    expect(prep.spellAccess).toHaveLength(1);
    const grant = prep.spellAccess[0];
    expect(grant.featureKey).toBe(MAGIC_INITIATE_KEY);
    expect(grant.featureDe).toBe(await magicInitiateDe());
    // Der Hintergrund „Weiser" legt die Liste fest → keine Frage mehr, nur noch ein Wert.
    expect(grant.lists).toEqual([MAGIC_INITIATE_LIST]);
    expect(grant.abilities).toEqual(['Intelligence', 'Wisdom', 'Charisma']);
    expect(grant.picks).toEqual([
      { level: 0, levels: [0], schools: [], tier: 'prepared', count: MAGIC_INITIATE_CANTRIPS, sourceId: MAGIC_INITIATE_KEY, quotaId: 'cantrips' },
      { level: 1, levels: [1], schools: [], tier: 'prepared', count: MAGIC_INITIATE_LEVEL1, sourceId: MAGIC_INITIATE_KEY, quotaId: 'spell1' },
    ]);
  });

  it('hält das Talent aus dem Notiz-Eingang, aber im Merkmalsbestand', async () => {
    const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
    const keys = (fs: { key?: string }[]) => fs.map((f) => f.key ?? '');
    expect(keys(prep.gained)).toContain(MAGIC_INITIATE_KEY);
    // Derselbe Filter, den der Aufstieg vor dem Notiz-Pass fährt.
    const forNotes = withoutSpellAccessFeatures(prep.gained, prep.spellAccess);
    expect(keys(forNotes)).not.toContain(MAGIC_INITIATE_KEY);
    expect(forNotes.length).toBe(prep.gained.length - 1);
    // Der deutsche Bogen-Text entsteht aus `gained` — er darf das Talent nicht verlieren.
    const nameDe = await magicInitiateDe();
    expect(prep.summaryClass.some((s) => (s.nameDe ?? s.name) === nameDe)).toBe(true);
  });

  it('erzeugt bei festgelegter Liste nur Attributsfrage und Zauber-Wahlen', async () => {
    const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
    const choices = spellAccessChoices(prep.spellAccess[0]);
    expect(choices.map((c) => c.type)).toEqual(['choice', 'spell-pick', 'spell-pick']);

    const ability = choices[0];
    expect(ability.questionDe).toBe('Zauberattribut');
    expect(ability.options).toEqual(['Intelligence', 'Wisdom', 'Charisma']);
    expect(ability.optionsDe).toEqual(['Intelligenz', 'Weisheit', 'Charisma']);
    expect(ability.isBuildDecision).toBe(true);

    const [cantrips, level1] = [choices[1], choices[2]];
    expect(cantrips.spellLevels).toEqual([0]);
    expect(cantrips.max).toBe(MAGIC_INITIATE_CANTRIPS);
    expect(level1.spellLevels).toEqual([1]);
    expect(level1.max).toBe(MAGIC_INITIATE_LEVEL1);
    // Beide filtern die Bibliothek auf die festgelegte Liste; Namen kommen NIE von hier.
    expect([cantrips.spellClass, level1.spellClass]).toEqual([MAGIC_INITIATE_LIST, MAGIC_INITIATE_LIST]);
    expect([...cantrips.options, ...level1.options]).toEqual([]);
    // Die gewählten Zauber stehen im Zauber-Block, nicht im Merkmals-Ledger.
    expect([cantrips.isBuildDecision, level1.isBuildDecision]).toEqual([false, false]);
  });

  it('fragt die Liste ab, solange keine Quelle sie festlegt — und erst dann die Zauber', () => {
    const open: SpellAccessGrant = {
      featureKey: MAGIC_INITIATE_KEY,
      feature: 'Magic Initiate',
      featureDe: 'Eingeweihter der Magie',
      gainedAt: 1,
      sourceId: MAGIC_INITIATE_KEY,
      lists: ['cleric', 'druid', 'wizard'],
      listFromSource: false,
      abilities: ['Intelligence', 'Wisdom', 'Charisma'],
      picks: [{ level: 0, levels: [0], schools: [], tier: 'prepared', count: 2, sourceId: 'srd-2024_magic-initiate', quotaId: 'cantrips' }],
    };
    const unanswered = spellAccessChoices(open);
    expect(unanswered.map((c) => c.type)).toEqual(['choice', 'choice']);
    expect(unanswered[0].optionsDe).toEqual(['Kleriker', 'Druide', 'Magier']);

    const answered = spellAccessChoices(open, 'druid');
    expect(answered.filter((c) => c.type === 'spell-pick').map((c) => c.spellClass)).toEqual(['druid']);
    // Die Antwort kommt über die id der Listen-Frage zurück — sie muss stabil sein.
    expect(spellListChoiceId(open)).toBe(spellListChoiceId({ ...open, lists: ['cleric'] }));
    // Die id der ZAUBER-Wahl trägt dagegen die Liste: nach einem Listenwechsel darf die alte
    // Auswahl nicht als dieselbe Wahl weiterleben (sie wäre aus der falschen Liste).
    const pickId = (list: string) =>
      spellAccessChoices(open, list).find((c) => c.type === 'spell-pick')?.id;
    expect(pickId('druid')).not.toBe(pickId('cleric'));
  });

  it('gilt auch für einen Nicht-Zauberwirker (Kämpfer/Akolyth → Klerikerliste)', async () => {
    const prep = await buildFeaturePrep(FIGHTER_ACOLYTE);
    expect(prep.spellAccess).toHaveLength(1);
    expect(prep.spellAccess[0].lists).toEqual(['cleric']);
    expect(spellAccessChoices(prep.spellAccess[0]).filter((c) => c.type === 'spell-pick')).toHaveLength(2);
  });
});

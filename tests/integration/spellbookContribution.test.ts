/**
 * Erwerb und Behälter sind zweierlei (`into`) — OHNE LLM.
 *
 * „Add them to your spellbook for free" gewährt die Wahl am Hervorrufer und legt sie ins
 * Zauberbuch des Magiers. Geprüft wird beides: dass die Vorbereitung sie dort findet, und dass
 * das Kontingent des Zauberbuchs davon unberührt bleibt.
 *
 *   npm run test -- spellbookContribution
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { getSpellLibrary } from '../../src/lib/spellLibrary';
import { groupedSpellcasting, type SpellQuotaGroup } from '../../src/lib/services/spellcasting/grouped';
import { pickerKnown, pickLibrary } from '../../src/lib/services/spellcasting/picker';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { setPicks } from '../../src/lib/services/spellcasting/write';

const WIZARD = 'srd-2024_wizard_spellcasting';
const SAVANT = 'srd-2024_wizard_evoker_evocation-savant';
/** Hervorrufung, Grad 1 — der Zauber, den der Hervorrufer geschenkt bekommt. */
const BURNING_HANDS = 'srd-2024_burning-hands';
/** Bannmagie, Grad 1 — ein gewöhnlicher Eintrag des Zauberbuchs. */
const SHIELD = 'srd-2024_shield';

function evokerAt(level: number, picks: Record<string, Record<string, string[]>> = {}): Character {
  const c = characterSchema.parse({
    name: 'Prüfling',
    classes: [{
      sourceKey: 'srd-2024_wizard', name: 'Magier',
      subclassKey: 'srd-2024_evoker', subclassName: 'Hervorrufer', level,
    }],
    abilities: { int: 16 },
    mods: { int: 3 },
    proficiencyBonus: 2,
  });
  for (const [sourceId, quotas] of Object.entries(picks))
    for (const [quotaId, keys] of Object.entries(quotas)) setPicks(c.spellcasting, sourceId, quotaId, keys);
  return c;
}

const groupsOf = async (c: Character) => {
  const { state, lookup } = await loadSpellcasting(c);
  const view = groupedSpellcasting(state, lookup);
  const quota = (sourceId: string, quotaId: string): SpellQuotaGroup => {
    const hit = view.sources.find((s) => s.id === sourceId)?.quotas.find((q) => q.quotaId === quotaId);
    if (!hit) throw new Error(`${sourceId}/${quotaId} fehlt`);
    return hit;
  };
  return { view, quota };
};

describe('Hervorrufer legt seine Zauber ins Zauberbuch des Magiers', () => {
  it('führt beide Kontingente in den Pool der Vorbereitung', async () => {
    const { quota } = await groupsOf(
      evokerAt(3, { [WIZARD]: { book: [SHIELD] }, [SAVANT]: { 'evocation-book': [BURNING_HANDS] } }),
    );

    const prepared = quota(WIZARD, 'prepared');
    expect(prepared.from?.quotas).toEqual([
      { sourceId: WIZARD, quotaId: 'book' },
      { sourceId: SAVANT, quotaId: 'evocation-book' },
    ]);
    // Die Beschriftung bleibt die des genannten Kontingents, nicht die der Vereinigung.
    expect(prepared.from?.label).toBe('Zauberbuch');
    expect(prepared.from?.spells.map((s) => s.key).sort()).toEqual([SHIELD, BURNING_HANDS].sort());
  });

  it('lässt das Kontingent des Zauberbuchs unberührt', async () => {
    const { quota } = await groupsOf(
      evokerAt(3, { [WIZARD]: { book: [SHIELD] }, [SAVANT]: { 'evocation-book': [BURNING_HANDS] } }),
    );

    const book = quota(WIZARD, 'book');
    // Der geschenkte Zauber zählt gegen den Hervorrufer, nicht gegen das Zauberbuch.
    expect(book.spells.map((s) => s.key)).toEqual([SHIELD]);
    expect(book.open).toBe(book.count - 1);
    expect(quota(SAVANT, 'evocation-book').open).toBe(1);
    expect(quota(SAVANT, 'evocation-book').castNote).toBe('Bestand im Kontingent „Zauberbuch"');
  });

  it('bietet den geschenkten Zauber im Vorbereitungs-Dialog an, ohne ihn auszugrauen', async () => {
    const library = await getSpellLibrary();
    expect(library.length, 'Vault-Shim aktiv?').toBeGreaterThan(100);
    const { view, quota } = await groupsOf(
      evokerAt(3, { [SAVANT]: { 'evocation-book': [BURNING_HANDS] } }),
    );

    const prepared = quota(WIZARD, 'prepared');
    expect(pickLibrary(prepared, library).map((s) => s.key)).toEqual([BURNING_HANDS]);
    // Ausgegraut wäre er, wenn der Pool nur als fremder Bestand gälte — dann bliebe der Dialog
    // vollständig blockiert.
    expect(pickerKnown(view, prepared).has(BURNING_HANDS)).toBe(false);
  });

  it('bleibt ohne Subklasse beim reinen Zauberbuch', async () => {
    const c = characterSchema.parse({
      name: 'Prüfling',
      classes: [{ sourceKey: 'srd-2024_wizard', name: 'Magier', level: 3 }],
      mods: { int: 3 },
      proficiencyBonus: 2,
    });
    const { quota } = await groupsOf(c);
    expect(quota(WIZARD, 'prepared').from?.quotas).toEqual([{ sourceId: WIZARD, quotaId: 'book' }]);
  });
});

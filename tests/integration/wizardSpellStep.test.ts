/**
 * Der Zauber-Schritt des Wizards gegen den ECHTEN Vault: er liest dieselbe Auflösung wie der
 * Editor (`wizardCastingInput` → `loadSpellcasting` → `groupedSpellcasting`), damit eine im
 * Wizard getroffene Wahl im Editor an derselben Quota steht. Der Kleriker ist der Fall, der
 * das vorher brach — Thaumaturg zählt in EINEM eigenen Kontingent, nicht im Klassen-Feld.
 *
 *   npm run test -- wizardSpellStep
 */
import { describe, expect, it } from 'vitest';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { optionListChoice } from '../../src/lib/services/declaration/optionList';
import { groupedSpellcasting } from '../../src/lib/services/spellcasting/grouped';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { emptySpellcasting, setPicks } from '../../src/lib/services/spellcasting/write';
import { wizardCastingInput, type WizardCastingSource } from '../../src/lib/services/wizard/castingDraft';
import { spellStepDone, spellStepRows, type SpellStepRow } from '../../src/lib/services/wizard/spellRows';
import { pointBuyStart } from '../../src/lib/services/wizard/pointBuy';

const CLERIC = 'srd-2024_cleric';

const source = (over: Partial<WizardCastingSource> = {}): WizardCastingSource => ({
  klass: { sourceKey: CLERIC, name: 'Kleriker' },
  species: { sourceKey: 'srd-2024_human', name: 'Mensch' },
  // Ein Hintergrund OHNE Zauber-Talent; der Weise bringt Eingeweihter der Magie mit und
  // hätte in jeder Erwartung unten eigene Zeilen (siehe letzter Fall).
  background: { sourceKey: 'srd-2024_soldier', name: 'Soldat' },
  featureChoices: [],
  resolvedChoices: [],
  declaredAnswers: [],
  fightingStyles: [],
  scores: pointBuyStart(),
  asi: {},
  spellcasting: emptySpellcasting(),
  ...over,
});

/** Die Divine-Order-Antwort so, wie der Merkmals-Schritt sie hinterlegt. */
async function withDivineOrder(w: WizardCastingSource, answer: string): Promise<WizardCastingSource> {
  const prog = await getProgressionByKey(CLERIC);
  const feature = prog!.features.find((f) => f.key === `${CLERIC}_divine-order`)!;
  const choice = optionListChoice(feature)!;
  return { ...w, featureChoices: [choice], declaredAnswers: [{ id: choice.id, choice: answer }] };
}

async function rowsOf(w: WizardCastingSource): Promise<SpellStepRow[]> {
  const { state, lookup } = await loadSpellcasting(wizardCastingInput(w));
  return spellStepRows(groupedSpellcasting(state, lookup));
}

/** Kontingent-Id → Zahl; die Reihenfolge ist die der Quellen und hier ohne Aussage. */
const cantripCounts = (rows: SpellStepRow[]): Record<string, number> =>
  Object.fromEntries(
    rows.filter((r) => r.quota.levels.join() === '0').map((r) => [r.quota.quotaId, r.count]),
  );

describe('Zauber-Schritt des Wizards', () => {
  it('trennt den Thaumaturg-Zaubertrick vom Klassen-Kontingent', async () => {
    const rows = await rowsOf(await withDivineOrder(source(), 'Thaumaturge'));
    expect(cantripCounts(rows)).toEqual({ cantrips: 3, thaumaturgeCantrip: 1 });
    // Genau der Fehler von vorher: EIN Feld über vier Zaubertricks.
    expect(rows.some((r) => r.count === 4 && r.quota.levels.includes(0))).toBe(false);
    // Beide Kontingente gehören dem Kleriker, das zweite nennt sein Merkmal.
    expect(rows.map((r) => r.source)).toContain('Kleriker · Göttliche Ordnung');
  });

  it('lässt das Kontingent mit der Wahl verschwinden', async () => {
    const rows = await rowsOf(await withDivineOrder(source(), 'Protector'));
    expect(cantripCounts(rows)).toEqual({ cantrips: 3 });
  });

  it('ist erst fertig, wenn BEIDE Kontingente gefüllt sind', async () => {
    const w = await withDivineOrder(source(), 'Thaumaturge');
    expect(spellStepDone(await rowsOf(w))).toBe(false);

    setPicks(w.spellcasting, `${CLERIC}_spellcasting`, 'cantrips', ['a', 'b', 'c']);
    setPicks(w.spellcasting, `${CLERIC}_spellcasting`, 'prepared', ['d', 'e', 'f', 'g']);
    expect(spellStepDone(await rowsOf(w))).toBe(false);

    setPicks(w.spellcasting, `${CLERIC}_divine-order`, 'thaumaturgeCantrip', ['h']);
    const rows = await rowsOf(w);
    expect(spellStepDone(rows)).toBe(true);
    expect(
      rows.filter((r) => r.quota.levels.join() === '0').map((r) => r.spells.length).sort(),
    ).toEqual([1, 3]);
  });

  it('führt Zauberbuch und Vorbereitung des Magiers in EINER Zeile', async () => {
    const rows = await rowsOf(source({ klass: { sourceKey: 'srd-2024_wizard', name: 'Magier' } }));
    const book = rows.find((r) => r.prepared);
    expect(book?.count).toBe(6);
    expect(book?.prepared?.count).toBe(4);
    // Die Vorbereitung hat keine eigene Zeile: Zaubertricks + Buch, sonst nichts.
    expect(rows).toHaveLength(2);
  });

  it('hat für eine Klasse ohne Zauberwirken keine Zeile', async () => {
    const rows = await rowsOf(source({ klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' } }));
    expect(rows).toEqual([]);
    expect(spellStepDone(rows)).toBe(true);
  });

  /**
   * Der Zauber-Zugang eines Talents ist ein Kontingent wie jedes andere — vorher stand er als
   * KI-Wahl NEBEN dem Klassenangebot und landete quellenlos am Charakter.
   */
  it('gibt dem Talent des Hintergrunds eigene Zeilen', async () => {
    const rows = await rowsOf(
      source({
        klass: { sourceKey: 'srd-2024_fighter', name: 'Kämpfer' },
        background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
      }),
    );
    expect(rows.every((r) => r.source === 'Eingeweihter der Magie')).toBe(true);
    expect(rows.map((r) => r.count)).toEqual([2, 1]);
    // Der Weise legt die Liste fest — ohne sie böte der Dialog die ganze Bibliothek an.
    expect(new Set(rows.flatMap((r) => r.quota.lists))).toEqual(new Set(['wizard']));
  });
});

/**
 * Der Schreibpfad der neuen Persistenz: Formular-Rundlauf, `applyChanges` und der Stand der
 * sechs migrierten Charaktere im Vault.
 *
 *   npm run test -- castingWrite
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { vaultCharacter } from '../support/vaultCharacter';
import { applyChanges } from '../../src/lib/services/applyChanges';
import { formDraftPatch, initialFormCarry, initialFormFields } from '../../src/lib/services/characterFormFields';
import { legacyFlatView } from '../../src/lib/services/spellcasting/legacy';
import { loadSheetSpellcasting, loadSpellcasting, openSpellChoices } from '../../src/lib/services/spellcasting/project';
import { addExtra, cloneSpellcasting, pickedKeys, setPicks } from '../../src/lib/services/spellcasting/write';


const blank = (): Character => characterSchema.parse({ name: 'Prüfling' });

describe('Formular-Rundlauf', () => {
  it('trägt Auswahl und quellenlosen Bestand zurück in die Datei', () => {
    const c = blank();
    const form = initialFormFields(c);
    setPicks(form.spellcasting, 'srd-2024_wizard_spellcasting', 'cantrips', ['srd-2024_light', 'srd-2024_fire-bolt']);
    addExtra(form.spellcasting, 'srd-2024_find-familiar');

    const patch = formDraftPatch(form, initialFormCarry(c));
    expect(patch.spellcasting.sources['srd-2024_wizard_spellcasting'].picks.cantrips)
      .toEqual(['srd-2024_light', 'srd-2024_fire-bolt']);
    expect(patch.spellcasting.manual?.extra).toEqual(['srd-2024_find-familiar']);
    // Die Altform verschwindet mit dem Speichern.
    expect(patch.spells).toBeUndefined();
  });

  it('wirft Quellen ohne Inhalt beim Speichern heraus', () => {
    const c = blank();
    const form = initialFormFields(c);
    setPicks(form.spellcasting, 'srd-2024_bard_spellcasting', 'prepared', []);
    expect(formDraftPatch(form, initialFormCarry(c)).spellcasting.sources).toEqual({});
  });

  // Der Zauber-Picker im Editor liest seine offene Auswahl über `pickedKeys` — ein Leser, der
  // eine ungeschriebene Quota nicht als „leer" meldet, ließe ihn nichts abwählen.
  it('liest zurück, was geschrieben wurde, und Ungeschriebenes als leer', () => {
    const block = initialFormFields(blank()).spellcasting;
    expect(pickedKeys(block, 'srd-2024_cleric_spellcasting', 'prepared')).toEqual([]);

    setPicks(block, 'srd-2024_cleric_spellcasting', 'prepared', ['srd-2024_bless', 'srd-2024_bless']);
    expect(pickedKeys(block, 'srd-2024_cleric_spellcasting', 'prepared')).toEqual(['srd-2024_bless']);
    expect(pickedKeys(block, 'srd-2024_cleric_spellcasting', 'cantrips')).toEqual([]);

    setPicks(block, 'srd-2024_cleric_spellcasting', 'prepared', []);
    expect(pickedKeys(block, 'srd-2024_cleric_spellcasting', 'prepared')).toEqual([]);
  });
});

describe('applyChanges', () => {
  it('legt gewährte Zauber als Keys in den quellenlosen Bestand', () => {
    const c = blank();
    applyChanges(
      c,
      [
        { target: 'cantrip', name: 'Licht', step: '', source: '', label: '' },
        { target: 'preparedSpell', level: 1, name: 'Springen', prepared: true, step: '', source: '', label: '' },
      ],
      { classIndex: 0, resolveSpellKey: (name) => (name === 'Licht' ? 'srd-2024_light' : 'srd-2024_jump') },
    );
    expect(c.spellcasting.manual?.extra).toEqual(['srd-2024_light', 'srd-2024_jump']);
  });

  it('übernimmt einen Zauber ohne Bibliothekstreffer nicht', () => {
    const c = blank();
    applyChanges(c, [{ target: 'cantrip', name: 'Erfundener Zauber', step: '', source: '', label: '' }], {
      classIndex: 0,
      resolveSpellKey: () => undefined,
    });
    expect(c.spellcasting.manual?.extra ?? []).toEqual([]);
  });

  it('lässt abgeleitete Plätze unberührt und wächst nur bei Handeingabe', () => {
    const derived = blank();
    applyChanges(derived, [{ target: 'spellSlot', level: 1, value: 2, step: '', source: '', label: '' }], { classIndex: 0 });
    expect(derived.spellcasting.manual?.slotTotals ?? []).toEqual([]);

    const manual = blank();
    manual.spellcasting.manual = { slotTotals: [1, 0, 0, 0, 0, 0, 0, 0, 0], extra: [] };
    applyChanges(manual, [{ target: 'spellSlot', level: 1, value: 2, step: '', source: '', label: '' }], { classIndex: 0 });
    expect(manual.spellcasting.manual?.slotTotals[0]).toBe(3);
  });
});

describe('die migrierten Charaktere', () => {
  it('füllt beim Druiden die Kontingente vollständig', async () => {
    const c = vaultCharacter('Bulgur');
    const { state } = await loadSpellcasting(c);
    expect(openSpellChoices(state, (await loadSpellcasting(c)).lookup)).toEqual([]);
    const picks = c.spellcasting.sources['srd-2024_druid_spellcasting'].picks;
    expect(picks.cantrips).toHaveLength(2);
    expect(picks.prepared).toHaveLength(5);
    expect(c.spellcasting.manual?.extra ?? []).toEqual([]);
  });

  /**
   * Der Fall aus dem Live-Test: das Attribut steht als Antwort im Merkmals-Ledger, die Liste
   * legt der Hintergrund fest („Weiser" ist immer Magier). Beides muss im Zauberblock stehen,
   * ohne dass der Wert irgendwo ein zweites Mal gespeichert wird.
   */
  it('liest Attribut und Liste des Herkunftstalents aus Ledger und Hintergrund', async () => {
    const c = vaultCharacter('Bölgör');
    const { state } = await loadSpellcasting(c);
    const access = state.sources.find((s) => s.source.featureKey === 'srd-2024_magic-initiate');
    expect(access?.ability).toBe('Charisma');
    expect(access?.saveDC).not.toBeNull();
    expect(access?.quotas.map((q) => q.view.pool.lists)).toEqual([['wizard'], ['wizard']]);
  });

  it('speichert gewährte Zauber nicht, zeigt sie aber auf dem Bogen', async () => {
    const c = vaultCharacter('Prüfling Mondkreis');
    const stored = Object.values(c.spellcasting.sources).flatMap((s) => Object.values(s.picks).flat());
    expect(stored).not.toContain('phb-2024_starry-wisp');
    expect(stored).not.toContain('srd-2024_moonbeam');

    const view = await loadSheetSpellcasting(c);
    const all = view.levels.flatMap((l) => l.spells);
    expect(all.find((s) => s.label === 'Sternenlichtfunke')?.source).toBe('Zauber des Zirkels des Mondes');
    // Seit der Wilde Gefährte deklariert ist, hängt „Vertrauten finden" an der Klasse.
    expect(all.find((s) => s.label === 'Vertrauten finden')?.source).toBe('Druide');
  });

  it('behält Plätze und Zauber des unverlinkten Charakters', async () => {
    const c = vaultCharacter('Phönix');
    expect(c.spellcasting.manual?.slotTotals[0]).toBe(2);
    expect(c.spellcasting.manual?.extra).toHaveLength(10);

    const view = await loadSheetSpellcasting(c);
    expect(view.levels.flatMap((l) => l.spells)).toHaveLength(10);
  });

  it('speist den PDF-Export weiter aus der Projektion', async () => {
    const c = vaultCharacter('Bulgur');
    const { state, lookup, legacy } = await loadSpellcasting(c);
    const flat = legacyFlatView(state, lookup, legacy);
    expect(flat.spellcastingClass).toBe('Druide');
    expect(flat.spellcastingAbility).toBe('Weisheit');
    expect(flat.slots[0].total).toBe(3);
    expect(flat.cantrips).toHaveLength(2);
    expect(flat.byLevel['1']).toHaveLength(6);
  });
});

describe('Reaktive Formulardaten', () => {
  /** Ein $state-Proxy erreicht den Schreibpfad genauso; `structuredClone` bricht daran ab. */
  it('kopiert einen Block hinter einem Proxy', async () => {
    const c = vaultCharacter('Bulgur');
    const proxied = new Proxy(c.spellcasting, {});
    expect(() => structuredClone(proxied)).toThrow();

    const copy = cloneSpellcasting(proxied);
    setPicks(copy, 'srd-2024_druid_spellcasting', 'cantrips', ['srd-2024_guidance']);
    expect(pickedKeys(copy, 'srd-2024_druid_spellcasting', 'cantrips')).toEqual(['srd-2024_guidance']);
    expect(pickedKeys(c.spellcasting, 'srd-2024_druid_spellcasting', 'cantrips')).not.toContain('srd-2024_guidance');

    const view = await loadSheetSpellcasting({ ...c, spellcasting: proxied });
    expect(view.levels.flatMap((l) => l.spells).length).toBeGreaterThan(0);
  });
});

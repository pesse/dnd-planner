/**
 * Fortlaufende pro-Stufe-Effekte — OHNE LLM, über den ECHTEN Vault.
 *
 * Bis `docs/plan-wahlen-deklarieren.md` Stufe 0 war das ein Reasoning-Call
 * (`levelUpEffectsAction`) über den gesamten Merkmalsbestand, und deshalb ungetestet:
 * einen LLM-Call kann man nicht in einer Zusicherung festhalten. Jetzt ist es eine
 * Deklaration im Vault (`grants.perLevel.hpMax`) — und diese Datei ist die Stelle, die
 * bemerkt, wenn sie verschwindet oder ein drittes Merkmal sie unbemerkt bekommt.
 *
 *   npm run eval -- --eval perLevelEffects
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../src/lib/speciesLibrary';
import { getFeats } from '../src/lib/featsLibrary';
import { hpPerLevelSources, hpPerLevelSum } from '../src/lib/services/perLevelEffects';

describe('pro-Stufe-Effekte aus der Deklaration', () => {
  it('deklariert im ganzen Vault genau die zwei bekannten Fälle', async () => {
    const list = await getSpeciesList();
    expect(list.length, 'Vault-Shim aktiv?').toBeGreaterThan(5);

    const declared: string[] = [];
    for (const info of list) {
      const spec = await getSpeciesByKey(info.key);
      for (const t of spec?.traits ?? []) {
        if (t.grants?.perLevel?.hpMax) declared.push(`${t.key} = ${t.grants.perLevel.hpMax}`);
      }
    }
    for (const f of await getFeats()) {
      if (f.grants?.perLevel?.hpMax) declared.push(`${f.sourceKey} = ${f.grants.perLevel.hpMax}`);
    }

    // Genau die beiden Fälle, die der abgelöste Prompt selbst als Beispiel nannte. Ein
    // dritter wäre entweder ein neues Merkmal — oder eine Fehl-Redaktion.
    expect(declared.sort()).toEqual([
      'phb-2024_tough = 2',
      'srd-2024_dwarf_dwarven-toughness = 1',
    ]);
  });

  it('summiert Zwerg + Zäh zu +3 je Stufe', async () => {
    const dwarf = await getSpeciesByKey('srd-2024_dwarf');
    const toughness = dwarf?.traits.find((t) => t.key === 'srd-2024_dwarf_dwarven-toughness');
    const tough = (await getFeats()).find((f) => f.sourceKey === 'phb-2024_tough');
    expect(toughness && tough, 'Vault-Einträge vorhanden').toBeTruthy();

    const features = [
      ...(dwarf?.traits ?? []).map((t) => ({ key: t.key, name: t.name, grants: t.grants })),
      { key: tough!.sourceKey ?? '', name: tough!.name, grants: tough!.grants },
    ];
    const sources = hpPerLevelSources(features);
    expect(sources.map((s) => s.sourceKey)).toEqual(['srd-2024_dwarf_dwarven-toughness', 'phb-2024_tough']);
    expect(hpPerLevelSum(sources)).toBe(3);
    // Auf Stufe 5 wendet der Aufstieg die Summe × gewonnene Stufen an.
    expect(hpPerLevelSum(sources) * 5).toBe(15);
  });

  it('zählt dasselbe Merkmal nicht doppelt, egal aus welcher Richtung es kommt', () => {
    const grants = { perLevel: { hpMax: 1 } };
    // Bibliotheks-Trait (deutscher Anzeigename) und neu gewonnenes Merkmal (englisch) —
    // vor der Dedup über den Key hätte der Name sie nicht zusammengeführt.
    const sources = hpPerLevelSources([
      { key: 'srd-2024_dwarf_dwarven-toughness', name: 'Zwergische Zähigkeit', grants },
      { key: 'srd-2024_dwarf_dwarven-toughness', name: 'Dwarven Toughness', grants },
    ]);
    expect(sources).toHaveLength(1);
    expect(hpPerLevelSum(sources)).toBe(1);
  });

  it('ignoriert Merkmale ohne und mit leerer Deklaration', () => {
    expect(hpPerLevelSources([
      { key: 'a', name: 'nicht redigiert' },
      { key: 'b', name: 'geprüft, ohne Mechanik', grants: { perLevel: { hpMax: 0 } } },
    ])).toEqual([]);
  });

  it('fällt ohne Key auf den Namen zurück (Altdaten ohne Bibliotheks-Link)', () => {
    const sources = hpPerLevelSources([
      { name: 'Zäh', grants: { perLevel: { hpMax: 2 } } },
      { name: 'zäh', grants: { perLevel: { hpMax: 2 } } },
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0].sourceKey).toBe('');
  });
});

/**
 * Tabellen-Übersichten über den ECHTEN Vault: jede Zeile füllt jede Spalte, jede Gruppe ist filterbar.
 *
 *   npm run test -- catalogs
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../src/lib/services/catalog/catalogs';
import { catalogEntry, facetOptions, parseCatalogPath } from '../../src/lib/services/catalog/catalogTypes';

describe.each(Object.values(CATALOGS))('Katalog $label', (spec) => {
  it('jedes Spalten-Set nennt nur bekannte Spalten', () => {
    for (const ids of Object.values(spec.columnSets)) {
      for (const id of ids) expect(spec.columns).toHaveProperty(id);
    }
  });

  it('liefert Zeilen mit einer Zelle je Spalte und einer bekannten Gruppe', async () => {
    const { rows, groups } = await spec.load();
    expect(rows.length).toBeGreaterThan(50);
    const groupIds = new Set(groups.map((g) => g.id));
    for (const row of rows) {
      expect(Object.keys(row.cells).sort()).toEqual(Object.keys(spec.columns).sort());
      expect(Object.keys(row.facets).sort()).toEqual(Object.keys(spec.facets).sort());
      expect(groupIds.has(row.group)).toBe(true);
    }
  });
});

describe('Katalog-Werte', () => {
  it('Monster: HG sortiert numerisch, Brüche als Text', async () => {
    const { rows } = await CATALOGS.monster.load();
    const goblin = rows.find((r) => r.altName === 'Goblin Warrior');
    expect(goblin?.cells.cr).toEqual({ text: '1/4', sort: 0.25 });
  });

  it('Gegenstände: Preis in Kupfer, Schaden nach Durchschnitt', async () => {
    const { rows } = await CATALOGS.item.load();
    const longsword = rows.find((r) => r.altName === 'Longsword' && r.group === 'weapon');
    expect(longsword?.cells.cost).toEqual({ text: '15 GM', sort: 1500 });
    expect(longsword?.cells.damage.sort).toBe(4.5);
    expect(longsword?.cells.weaponCategory.text).toBe('Kriegswaffe');
    expect(longsword?.cells.weaponRange.text).toBe('Nahkampf');
  });

  it('Rüstung: RK mit GES-Deckel', async () => {
    const { rows } = await CATALOGS.item.load();
    const breastplate = rows.find((r) => r.altName === 'Breastplate' && r.group === 'armor');
    expect(breastplate?.cells.ac).toEqual({ text: '14 + GES (max. 2)', sort: 14 });
  });

  it('Quelle und Seltenheit sind Filter, gewöhnliche Gegenstände zuerst', async () => {
    const { rows } = await CATALOGS.item.load();
    expect(facetOptions(rows, 'source').map((o) => o.label)).toContain('DMG 2024');
    expect(facetOptions(rows, 'rarity').map((o) => o.id)).toEqual(
      ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'],
    );
  });

  it('Einstimmung als Haken', async () => {
    const { rows } = await CATALOGS.item.load();
    const attuned = rows.find((r) => r.altName === 'Gauntlets of Ogre Power');
    expect(attuned?.cells.attunement.text).toBe('✓');
  });
});

describe('Katalog-Pfad', () => {
  it('trägt den Filter für Zurück/Vor', () => {
    const entry = catalogEntry('item', 'Gegenstände', { id: 'weapon', label: 'Waffen' });
    expect(entry.name).toBe('Gegenstände · Waffen');
    expect(parseCatalogPath(entry.path)).toEqual({ kind: 'item', group: 'weapon' });
    expect(parseCatalogPath(catalogEntry('monster', 'Monster').path)).toEqual({ kind: 'monster', group: '' });
  });
});

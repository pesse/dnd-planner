/**
 * Tabellen-Übersichten über den ECHTEN Vault: jede Zeile füllt jede Spalte, jede Gruppe ist filterbar.
 *
 *   npm run test -- catalogs
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../src/lib/services/catalog/catalogs';
import { catalogEntry, parseCatalogPath } from '../../src/lib/services/catalog/catalogTypes';

describe.each(Object.values(CATALOGS))('Katalog $label', (spec) => {
  it('liefert Zeilen mit einer Zelle je Spalte und einer bekannten Gruppe', async () => {
    const { rows, groups } = await spec.load();
    expect(rows.length).toBeGreaterThan(50);
    const groupIds = new Set(groups.map((g) => g.id));
    for (const row of rows) {
      expect(row.cells).toHaveLength(spec.columns.length);
      expect(groupIds.has(row.group)).toBe(true);
    }
  });
});

describe('Katalog-Werte', () => {
  it('Monster: HG sortiert numerisch, Brüche als Text', async () => {
    const { rows } = await CATALOGS.monster.load();
    const goblin = rows.find((r) => r.path.endsWith('/goblin-warrior.json') || r.altName === 'Goblin Warrior');
    expect(goblin?.cells[0]).toEqual({ text: '1/4', sort: 0.25 });
  });

  it('Gegenstände: Preis sortiert in Kupfer', async () => {
    const { rows } = await CATALOGS.item.load();
    const longsword = rows.find((r) => r.altName === 'Longsword' && r.group === 'weapon');
    expect(longsword?.cells[2]).toEqual({ text: '15 GM', sort: 1500 });
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

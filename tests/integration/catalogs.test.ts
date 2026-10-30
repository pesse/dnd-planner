/**
 * Tabellen-Übersichten über den ECHTEN Vault: jede Zeile füllt jede Spalte, jede Gruppe ist filterbar.
 *
 *   npm run test -- catalogs
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../src/lib/services/catalog/catalogs';
import { catalogEntry, facetOptions, facetValues, parseCatalogPath } from '../../src/lib/services/catalog/catalogTypes';
import { rangeSortKey, timeCell, timeSortKey } from '../../src/lib/services/catalog/spellCatalog';

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

  it('Quelle und Seltenheit sind Filter, „Variiert" zuletzt', async () => {
    const { rows } = await CATALOGS.item.load();
    expect(facetOptions(rows, 'source').map((o) => o.label)).toContain('DMG 2024');
    expect(facetOptions(rows, 'rarity').map((o) => o.id)).toEqual(
      ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'varies'],
    );
  });

  it('Basiswaffe und Zaubergebundene Waffe trennen sich über Magie, nicht über die Seltenheit', async () => {
    const { rows } = await CATALOGS.item.load();
    const halberd = rows.find((r) => r.path.endsWith('/weapon/halberd.json'));
    const enspelled = rows.find((r) => r.altName === 'Enspelled Weapon (Halberd)');
    expect(facetValues(halberd!, 'magic')[0]?.id).toBe('mundane');
    expect(halberd?.facets.rarity).toBeUndefined();
    expect(halberd?.cells.rarity.text).toBe('');
    expect(facetValues(enspelled!, 'magic')[0]?.id).toBe('magic');
    expect(facetValues(enspelled!, 'rarity')[0]?.id).toBe('varies');
    expect(enspelled?.cells.rarity.text).toBe('variiert');
  });

  it.each([
    ['Antitoxin', 'adventuring-gear'],
    ['Case, Map or Scroll', 'adventuring-gear'],
    ['Airship', 'airborne-vehicle'],
  ])('%s liegt als nicht-magischer Gegenstand in %s', async (name, group) => {
    const { rows } = await CATALOGS.item.load();
    const row = rows.find((r) => r.altName === name);
    expect(row?.group).toBe(group);
    expect(facetValues(row!, 'magic')[0]?.id).toBe('mundane');
  });

  it('Einstimmung als Haken', async () => {
    const { rows } = await CATALOGS.item.load();
    const attuned = rows.find((r) => r.altName === 'Gauntlets of Ogre Power');
    expect(attuned?.cells.attunement.text).toBe('✓');
  });

  it.each([
    ['Athlete', 'General', '4', 'STÄ, GES'],
    ['Resilient', 'General', '4', 'beliebig'],
    ['Ability Score Improvement', 'General', '4', 'beliebig'],
    ['Actor', 'General', '4', 'CHA'],
    ['Alert', 'Origin', '', ''],
  ])('Talent %s: Kategorie, Stufe und Attribut', async (name, group, level, abilities) => {
    const { rows } = await CATALOGS.feat.load();
    const row = rows.find((r) => r.altName === name);
    expect(row?.group).toBe(group);
    expect(row?.cells.level.text).toBe(level);
    expect(row?.cells.abilities.text).toBe(abilities);
  });

  it('Talente: wiederholbar als Haken', async () => {
    const { rows } = await CATALOGS.feat.load();
    expect(rows.find((r) => r.altName === 'Ability Score Improvement')?.cells.repeatable.text).toBe('✓');
  });

  it('Zauber: Auslöser und „oder Ritual" fallen aus dem Zeitaufwand, bleiben im Tooltip', async () => {
    const { rows } = await CATALOGS['spell-school'].load();
    const shield = rows.find((r) => r.altName === 'Shield');
    const detect = rows.find((r) => r.altName === 'Detect Magic');
    expect(shield?.cells.castingTime.text).toBe('Reaktion');
    expect(shield?.cells.castingTime.title).toMatch(/^Reaktion, die du ausführst/);
    expect(detect?.cells.castingTime.text).toBe('Aktion');
    expect(detect?.cells.duration.text).toBe('10 Minuten');
    expect(detect?.cells.concentration.text).toBe('✓');
    expect(detect?.cells.ritual.text).toBe('✓');
  });

  it('Zauber: eine Klasse filtert jeden Zauber, der sie unter mehreren nennt', async () => {
    const { rows } = await CATALOGS['spell-level'].load();
    const fireball = rows.find((r) => r.altName === 'Fireball');
    expect(fireball?.group).toBe('3');
    expect(fireball?.facets.school).toEqual({ id: 'hervorrufung', label: 'Hervorrufung' });
    expect(facetValues(fireball!, 'class').map((v) => v.label)).toEqual(['Zauberer', 'Magier']);
    expect(facetOptions(rows, 'class').map((o) => o.id)).toContain('cleric');
  });

  it('Zauber: Grade aufsteigend, Zaubertricks zuerst', async () => {
    const { groups } = await CATALOGS['spell-level'].load();
    expect(groups.map((g) => g.label)).toEqual(
      ['Zaubertricks', ...Array.from({ length: 9 }, (_, i) => `Grad ${i + 1}`)],
    );
  });
});

describe('Zauber-Sortierung', () => {
  it.each([
    ['Reaktion, die du ausführst …', 'Bonusaktion'],
    ['Bonusaktion', 'Aktion oder Ritual'],
    ['Aktion', '1 Runde'],
    ['Konzentration, bis zu 1 Minute', '10 Minuten'],
    ['24 Stunden', '10 Tage'],
    ['10 Tage', 'Bis der Zauber gebannt wird'],
    ['Unmittelbar', 'Bis zu 1 Minute'],
  ])('Zeit: %s vor %s', (a, b) => {
    expect(timeSortKey(a)).toBeLessThan(timeSortKey(b));
  });

  it.each([
    ['Selbst', 'Berührung'],
    ['Berührung', '1,5 Meter'],
    ['90 Meter', '1,6 Kilometer'],
    ['800 km', 'Sicht'],
    ['Unbegrenzt', 'Besonders'],
  ])('Reichweite: %s vor %s', (a, b) => {
    expect(rangeSortKey(a)).toBeLessThan(rangeSortKey(b));
  });

  it('kürzt Konzentration und führende „1" ab', () => {
    expect(timeCell('1 Bonusaktion')).toMatchObject({ text: 'Bonusaktion', title: '1 Bonusaktion' });
    expect(timeCell('Konzentration, bis zu 1 Stunde').text).toBe('1 Stunde');
    expect(timeCell('1 Minute')).toEqual({ text: '1 Minute', sort: 60, title: undefined });
  });
});

describe('Katalog-Pfad', () => {
  it('trägt den Filter für Zurück/Vor', () => {
    const entry = catalogEntry('item', 'Gegenstände', { id: 'weapon', label: 'Waffen' });
    expect(entry.name).toBe('Gegenstände · Waffen');
    expect(parseCatalogPath(entry.path)).toEqual({ kind: 'item', group: 'weapon' });
    expect(parseCatalogPath(catalogEntry('monster', 'Monster').path)).toEqual({ kind: 'monster', group: '' });
    expect(parseCatalogPath(catalogEntry('feat', 'Talente').path)).toEqual({ kind: 'feat', group: '' });
    expect(parseCatalogPath('catalog:spell-level/3')).toEqual({ kind: 'spell-level', group: '3' });
    expect(parseCatalogPath('catalog:spell')).toBeNull();
  });
});

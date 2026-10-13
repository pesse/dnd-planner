/**
 * Was die Herkunfts-Schritte des Wizards aus dem ECHTEN Vault brauchen: Überblick und
 * Standardsatz je Grundklasse, Einsteigertexte, auflösbare Startausrüstung.
 *
 *   npm run test -- wizardOriginContent
 */
import { describe, expect, it } from 'vitest';
import { loadOriginCatalog } from '../../src/lib/services/wizard/originCatalog';
import { equipmentIndex } from '../../src/lib/services/wizard/startingEquipment';
import { isStandardArray } from '../../src/lib/services/wizard/pointBuy';

describe('Herkunfts-Katalog des Wizards', async () => {
  const catalog = await loadOriginCatalog();

  it('führt die zwölf Grundklassen mit Überblick, Standardsatz und Einsteigertext', () => {
    expect(catalog.classes).toHaveLength(12);
    for (const c of catalog.classes) {
      expect(c.overview, c.key).toBeDefined();
      expect(c.overview!.primaryAbilities.length, c.key).toBeGreaterThan(0);
      expect(c.standardArray && isStandardArray(c.standardArray), c.key).toBe(true);
      expect(c.introDe?.trim(), c.key).toBeTruthy();
    }
  });

  it('gibt jedem Volk einen Einsteigertext', () => {
    expect(catalog.species.length).toBeGreaterThan(0);
    for (const s of catalog.species) expect(s.introDe?.trim(), s.key).toBeTruthy();
  });

  it('löst jeden Gegenstand der Startausrüstung in der Bibliothek auf', async () => {
    const index = await equipmentIndex();
    const owners = [...catalog.classes, ...catalog.backgrounds];
    const missing = owners.flatMap((o) =>
      (o.startingEquipmentOptions ?? []).flatMap((opt) =>
        opt.items.filter((i) => i.itemKey && !index.byKey.has(i.itemKey)).map((i) => `${o.key}: ${i.itemKey}`),
      ),
    );
    expect(missing).toEqual([]);
    expect(catalog.backgrounds.every((b) => (b.startingEquipmentOptions ?? []).length > 0)).toBe(true);
  });
});

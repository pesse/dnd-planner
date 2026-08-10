/**
 * Der Kleriker gegen den echten Vault. Er ist die einzige Klasse, die `grantsCasting` und
 * `grantsChoice.optionList` am SELBEN Merkmal trägt (Divine Order) und deren Subklasse ihren
 * Pool aus einer Tabelle im `desc` zieht — die zwei Pfade, die keine gemeldet-funktionierende
 * Klasse hat.
 *
 *   npm run test -- castingCleric
 */
import { describe, expect, it } from 'vitest';
import { characterSchema, type Character } from '../../src/lib/schemas/characterSchema';
import { sharedSlots } from '../../src/lib/services/resources/project';
import { resolveCasting } from '../../src/lib/services/spellcasting/resolve';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';
import { groupedSpellcasting } from '../../src/lib/services/spellcasting/grouped';

const CLERIC = 'srd-2024_cleric';
const LIFE_DOMAIN = 'srd-2024_life-domain';

interface ClericOptions {
  level?: number;
  subclass?: boolean;
  divineOrder?: string;
}

const cleric = ({ level = 1, subclass = false, divineOrder = '' }: ClericOptions = {}): Character =>
  characterSchema.parse({
    name: 'Testkleriker',
    classes: [
      {
        sourceKey: CLERIC,
        name: 'Kleriker',
        level,
        ...(subclass ? { subclassKey: LIFE_DOMAIN, subclassName: 'Domäne des Lebens' } : {}),
      },
    ],
    ...(divineOrder
      ? {
          features: [
            {
              sourceKey: `${CLERIC}_divine-order`,
              name: 'Divine Order',
              choice: divineOrder,
              gainedAt: 1,
              desc: '',
            },
          ],
        }
      : {}),
    mods: { wis: 3 },
    proficiencyBonus: 2,
  });

const sourceIds = (c: Character) => resolveCasting(c).then((r) => r.sources.map((s) => s.id));

describe('Kleriker-Zauberquellen', () => {
  it('führt das Klassen-Zauberwirken ab Stufe 1', async () => {
    const resolution = await resolveCasting(cleric());
    expect(resolution.sources.map((s) => s.id)).toContain(`${CLERIC}_spellcasting`);
    expect(resolution.issues).toEqual([]);
  });

  it('gibt Zaubertricks und vorbereitete Zauber aus der Stufentabelle', async () => {
    const view = groupedSpellcasting(...(await two(cleric())));
    const source = view.sources.find((s) => s.id === `${CLERIC}_spellcasting`);
    expect(source?.abilityDe).toBe('Weisheit');
    expect(source?.quotas.map((q) => [q.quotaId, q.count])).toEqual([
      ['cantrips', 3],
      ['prepared', 4],
    ]);
    expect(source?.quotas.every((q) => q.lists.includes('cleric'))).toBe(true);
  });

  it('gewährt den Thaumaturg-Zaubertrick nur bei beantworteter Divine Order', async () => {
    const quotasOf = async (divineOrder: string): Promise<string[]> => {
      const view = groupedSpellcasting(...(await two(cleric({ divineOrder }))));
      return view.sources.flatMap((s) => s.quotas.map((q) => q.quotaId));
    };
    expect(await quotasOf('')).not.toContain('thaumaturgeCantrip');
    expect(await quotasOf('Protector')).not.toContain('thaumaturgeCantrip');
    expect(await quotasOf('Thaumaturge')).toContain('thaumaturgeCantrip');
  });

  /**
   * `resolveCasting` filtert über die DEKLARIERTEN Quotas, der Zweigfilter greift erst in
   * `activeQuotas` — ohne diese Zusicherung bleibt „Kleriker · Divine Order" als Überschrift
   * ohne Inhalt stehen, sobald Beschützer gewählt ist.
   */
  it('zeigt keine Quelle ohne Kontingent an', async () => {
    for (const divineOrder of ['', 'Protector', 'Thaumaturge']) {
      const view = groupedSpellcasting(...(await two(cleric({ divineOrder }))));
      expect(view.sources.filter((s) => !s.quotas.length)).toEqual([]);
    }
  });

  it.each([1, 3, 5])('löst Stufe %i ohne Deklarationsfehler auf', async (level) => {
    const resolution = await resolveCasting(cleric({ level }));
    expect(resolution.issues).toEqual([]);
    expect(resolution.sources.length).toBeGreaterThan(0);
  });

  it.each([3, 5])('löst Stufe %i mit Domäne des Lebens auf', async (level) => {
    const resolution = await resolveCasting(cleric({ level, subclass: true }));
    expect(resolution.issues).toEqual([]);
    // Die Domänen-Zauber kommen aus der Tabelle im `desc` — der Pfad, den nur der Kleriker geht.
    const domain = resolution.sources.find((s) => s.origin === 'subclass');
    expect(domain?.quotas.length).toBeGreaterThan(0);
  });

  it('rechnet SG und Angriffsbonus aus dem Attribut der Deklaration', async () => {
    const c = cleric({ level: 5 });
    const view = groupedSpellcasting(...(await two(c)));
    const source = view.sources.find((s) => s.id === `${CLERIC}_spellcasting`);
    expect(source?.saveDC).toBe(8 + c.proficiencyBonus + c.mods.wis);
    expect(source?.attackBonus).toBe(c.proficiencyBonus + c.mods.wis);
    expect(sharedSlots(view.resources, 'standard').slice(0, 4)).toEqual([4, 3, 2, 0]);
  });
});

async function two(c: Character): Promise<[Awaited<ReturnType<typeof loadSpellcasting>>['state'], Awaited<ReturnType<typeof loadSpellcasting>>['lookup']]> {
  const { state, lookup } = await loadSpellcasting(c);
  return [state, lookup];
}

/**
 * Deterministischer Test der immer-vorbereiteten Zauberlisten — OHNE LLM.
 *
 * Er liest die ECHTEN Vault-Merkmale (über den fs-Shim, wie die Eval-Fixtures) und prüft,
 * dass der Parser genau die Listen findet, die vorher der Reasoning-Vorlauf aufzählen musste.
 * Damit ist die Zuständigkeitsgrenze festgenagelt: Tabelle = Daten, nicht Deutung.
 *
 *   npm run eval -- --eval grantedSpells
 */
import { describe, expect, it } from 'vitest';
import { getProgressionByKey } from '../src/lib/services/classProgression';
import type { ClassFeature } from '../src/lib/schemas/classProgression';
import {
  declaredSpellGrants,
  isSpellGrantFeature,
  parseSpellGrantRows,
  withoutSpellGrantFeatures,
} from '../src/lib/services/grantedSpells';
import {
  CIRCLE_OF_LAND_KEY,
  EXPECTED_CIRCLE_SPELLS,
  TOO_HIGH_CIRCLE_SPELLS,
} from './fixtures/druid-l3-circle-of-land';

const features = async (key: string): Promise<ClassFeature[]> => (await getProgressionByKey(key))?.features ?? [];

/**
 * Die zwölf Zauber der Stufe 3 aller vier Landarten — dieselbe Liste, gegen die vorher die
 * KI-Erdung gemessen wurde. Bewusst aus der Fixture importiert statt hier zweitgeschrieben:
 * es soll EINE Erwartung geben, egal wer sie erfüllt.
 */
const LAND_LEVEL3 = EXPECTED_CIRCLE_SPELLS;

describe('deklarierte Zauberlisten (Kreissprüche & Co.)', () => {
  it('liest beim Landzirkel alle vier Landarten und staffelt nach Stufe', async () => {
    const fs = await features(CIRCLE_OF_LAND_KEY);
    const list = fs.find((f) => isSpellGrantFeature(f));
    expect(list?.key).toBe('srd-2024_druid_circle-of-the-land_spell-list');

    const rows = parseSpellGrantRows(list?.desc ?? '');
    expect(rows.map((r) => r.level)).toEqual([3, 5, 7, 9]);
    // Vier Tabellen, VEREINIGT: die Landart wird nach jeder Langen Rast neu gewählt.
    expect(rows[0].names).toEqual(LAND_LEVEL3);
    expect(rows[1].names).toEqual(['Fireball', 'Sleet Storm', 'Lightning Bolt', 'Stinking Cloud']);

    expect(declaredSpellGrants(fs, 3)).toEqual(LAND_LEVEL3);
    expect(declaredSpellGrants(fs, 5)).toHaveLength(16);
    // „für deine Stufe und niedriger" — Stufe 4 bringt nichts Neues gegenüber 3.
    expect(declaredSpellGrants(fs, 4)).toEqual(LAND_LEVEL3);
    // Die Zeilen 5/7/9 dürfen auf Stufe 3 NICHT dabei sein (die Negativprobe, die vorher
    // gegen das Abschreiben ganzer Tabellen durch das Modell lief).
    const lvl3 = declaredSpellGrants(fs, 3);
    expect(TOO_HIGH_CIRCLE_SPELLS.filter((s) => lvl3.includes(s))).toEqual([]);
  });

  it('erkennt dieselbe Struktur bei Domäne, Eid, Patron und Drachenblut', async () => {
    const cases: [string, number, string[]][] = [
      ['srd-2024_life-domain', 3, ['Aid', 'Bless', 'Cure Wounds', 'Lesser Restoration']],
      ['srd-2024_oath-of-devotion', 3, ['Protection from Evil and Good', 'Shield of Faith']],
      ['srd-2024_fiend-patron', 3, []],
      ['srd-2024_draconic-sorcery', 3, ['Alter Self', 'Chromatic Orb', 'Command', "Dragon's Breath"]],
    ];
    for (const [key, level, expected] of cases) {
      const fs = await features(key);
      const found = fs.filter((f) => isSpellGrantFeature(f));
      expect(found, `${key}: genau ein Zauberlisten-Merkmal`).toHaveLength(1);
      if (expected.length) expect(declaredSpellGrants(fs, level), key).toEqual(expected);
      else expect(declaredSpellGrants(fs, level).length, key).toBeGreaterThan(0);
    }
  });

  it('hält die Zauberliste aus dem KI-Eingang, alles andere drin', async () => {
    const fs = await features('srd-2024_circle-of-the-land');
    const kept = withoutSpellGrantFeatures(fs);
    expect(kept).toHaveLength(fs.length - 1);
    expect(kept.map((f) => f.name)).toContain("Land's Aid");
    expect(kept.map((f) => f.name)).not.toContain('Circle of the Land Spells');
  });

  it('greift NICHT bei Merkmalen ohne Zusicherung oder ohne Tabelle', async () => {
    // Stufentabellen der Grundklasse: Tabelle ja, „always prepared" nein.
    const druid = await features('srd-2024_druid');
    expect(druid.filter((f) => isSpellGrantFeature(f))).toHaveLength(0);
    // Prosa mit „prepared", aber ohne Tabelle: das Zauberwirken selbst.
    expect(isSpellGrantFeature({ desc: 'You always have the listed spells prepared.' })).toBe(false);
    expect(isSpellGrantFeature({ desc: '' })).toBe(false);
  });
});

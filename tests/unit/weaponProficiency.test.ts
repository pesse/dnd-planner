/**
 * Die zwei Wege zur Waffenübung — Kategorie-Häkchen und Einzelnennung — und der
 * Altbestands-Fix, der Waffennamen aus dem Freitext in die Liste hebt.
 *
 * Ohne Bibliothek und ohne LLM: beide Einheiten bekommen ihre Auflösung als Parameter.
 */
import { describe, expect, it } from 'vitest';
import {
  coversWeapon, isProficientWithWeapon, weaponNameSet,
} from '../../src/lib/services/weaponProficiency';
import { weaponsFix, type LegacyLinkLibraries, type LegacyLinkTarget } from '../../src/lib/services/characterLegacyLinks';
import { applyChanges, changesWouldAlter } from '../../src/lib/services/applyChanges';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import type { Change } from '../../src/lib/schemas/levelUp';
import { emptyProficiencies } from '../../src/lib/pdf/characterFields';
import { emptySpellcasting } from '../../src/lib/services/spellcasting/write';
import { buildItemIndex, matchWeaponName, type ItemInfo } from '../../src/lib/itemLibrary';

const shortsword: ItemInfo = {
  name: 'Shortsword', name_de: 'Kurzschwert', category: 'weapon', rarity: '—', path: 'x/shortsword.json',
  key: 'srd-2024_shortsword', index: 'shortsword', magic: false, weapon_category: 'Martial', mastery: 'Vex',
};
const club: ItemInfo = {
  name: 'Club', name_de: 'Keule', category: 'weapon', rarity: '—', path: 'x/club.json',
  key: 'srd-2024_club', index: 'club', magic: false, weapon_category: 'Simple', mastery: 'Slow',
};
/** Magische Variante derselben Waffenart — trägt denselben `index`. */
const oathblade: ItemInfo = {
  name: 'Oathblade', category: 'weapon', rarity: 'Rare', path: 'x/oathblade.json',
  key: 'srd-2024_oathblade', index: 'shortsword', magic: true, weapon_category: 'Martial',
};

const byName = (n: string): ItemInfo | undefined =>
  [shortsword, club, oathblade].find(
    (i) => (i.name_de ?? i.name).toLowerCase() === n.trim().toLowerCase() || i.name.toLowerCase() === n.trim().toLowerCase(),
  );

describe('Waffenübung', () => {
  it('folgt dem Kategorie-Häkchen', () => {
    const prof = { simpleWeapons: true, martialWeapons: false };
    expect(isProficientWithWeapon(prof, club, byName)).toBe(true);
    expect(isProficientWithWeapon(prof, shortsword, byName)).toBe(false);
  });

  it('gilt für eine einzeln erklärte Waffe trotz fehlender Kategorie-Übung', () => {
    const prof = { simpleWeapons: true, martialWeapons: false, individualWeapons: ['Kurzschwert'] };
    expect(isProficientWithWeapon(prof, shortsword, byName)).toBe(true);
  });

  it('erkennt die englische Namensseite und die magische Variante derselben Art', () => {
    const prof = { individualWeapons: ['Shortsword'] };
    expect(isProficientWithWeapon(prof, shortsword, byName)).toBe(true);
    expect(isProficientWithWeapon(prof, oathblade, byName)).toBe(true);
  });

  it('gilt ohne Deklaration und ohne Häkchen nicht', () => {
    expect(isProficientWithWeapon({}, shortsword, byName)).toBe(false);
    expect(isProficientWithWeapon(undefined, shortsword, byName)).toBe(false);
  });

  it('trägt dieselbe Namensmenge für die Waffenbeherrschung', () => {
    const set = weaponNameSet(['Kurzschwert'], byName);
    expect(coversWeapon(set, oathblade)).toBe(true);
    expect(coversWeapon(set, club)).toBe(false);
  });
});

/** Nur die Felder, die `weaponsFix` anfasst. */
function target(other: string, individual: string[] = []): LegacyLinkTarget {
  return {
    classes: [], legacyClassLevel: '', species: { sourceKey: '', name: '' },
    backgroundRef: { sourceKey: '', name: '' }, inventory: [],
    spells: undefined, dropSpells: () => {}, spellcasting: emptySpellcasting(),
    proficiencies: { ...emptyProficiencies(), individualWeapons: individual, otherWeapons: other },
    attacks: [], weaponCtx: { strMod: 0, gesMod: 0, proficiencyBonus: 0, proficiencies: emptyProficiencies() },
  } as LegacyLinkTarget;
}

const libs = {
  classes: [], species: [], backgrounds: [], casting: null,
  items: {
    byKey: new Map([[shortsword.key!, shortsword]]),
    byName: new Map([['kurzschwert', shortsword], ['shortsword', shortsword]]),
    ambiguous: new Set<string>(),
  },
} as unknown as LegacyLinkLibraries;

/** Dieselbe Grenze wie der Altbestands-Fix, nur am Grant statt am Bestandsfeld. */
describe('Grant „weaponsOther" am Charakter', () => {
  const index = buildItemIndex({ weapon: [shortsword, club, oathblade] });
  const ctx = { classIndex: 0, resolveWeaponName: (n: string) => matchWeaponName(index, n) };
  const grant = (value: string): Change[] => [
    { target: 'weaponProficiencyOther', value, step: 'test', source: 'test', label: `Übung: ${value}` },
  ];

  it('wirkt als Einzelübung, wenn er eine Waffe der Bibliothek nennt', () => {
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, grant('Shortsword'), ctx);
    // Kanonisiert: die Datei trägt den Anzeigenamen, den auch der Bogen auflöst.
    expect(c.proficiencies.individualWeapons).toEqual(['Kurzschwert']);
    expect(c.proficiencies.otherWeapons).toBe('');
    expect(isProficientWithWeapon(c.proficiencies, oathblade, byName)).toBe(true);
  });

  it('lässt Prosa Freitext bleiben — sonst stünde sie auf keinem Bogen', () => {
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, grant('Martial weapons that have the Finesse or Light property'), ctx);
    expect(c.proficiencies.individualWeapons).toEqual([]);
    expect(c.proficiencies.otherWeapons).toBe('Martial weapons that have the Finesse or Light property');
  });

  it('doppelt einen schon erklärten Namen nicht, auch nicht in anderer Schreibweise', () => {
    const c = characterSchema.parse({ name: 'Prüfling', proficiencies: { individualWeapons: ['kurzschwert'] } });
    applyChanges(c, grant('Kurzschwert'), ctx);
    expect(c.proficiencies.individualWeapons).toEqual(['kurzschwert']);
  });

  // Die Vorschau der Merkmalsleiste („✓ übernommen") ist genau diese Frage: mit einem
  // Kontext OHNE Auflöser stünde dort ewig „Übernehmen", weil sie den Freitext simuliert.
  it('meldet nach dem Übernehmen keine weitere Änderung', () => {
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, grant('Shortsword'), ctx);
    expect(changesWouldAlter(c, grant('Shortsword'), ctx)).toBe(false);
  });

  it('bleibt ohne Auflösung Freitext', () => {
    const c = characterSchema.parse({ name: 'Prüfling' });
    applyChanges(c, grant('Kurzschwert'), { classIndex: 0 });
    expect(c.proficiencies.individualWeapons).toEqual([]);
    expect(c.proficiencies.otherWeapons).toBe('Kurzschwert');
  });
});

describe('Altbestand: Waffen im Freitext', () => {
  it('hebt exakte Bibliothekstreffer heraus und lässt Prosa stehen', () => {
    const t = target('Kurzschwert, Kriegswaffen mit Finesse');
    const fix = weaponsFix(t, libs);
    expect(fix?.label).toContain('1 Waffe');
    fix?.apply();
    expect(t.proficiencies.individualWeapons).toEqual(['Kurzschwert']);
    expect(t.proficiencies.otherWeapons).toBe('Kriegswaffen mit Finesse');
  });

  it('bietet beim zweiten Aufruf nichts mehr an', () => {
    const t = target('Kurzschwert; Steinhammer');
    weaponsFix(t, libs)?.apply();
    expect(weaponsFix(t, libs)).toBeUndefined();
    expect(t.proficiencies.otherWeapons).toBe('Steinhammer');
  });

  it('nimmt einen bereits erklärten Namen aus dem Freitext, ohne ihn zu doppeln', () => {
    const t = target('Kurzschwert', ['Kurzschwert']);
    weaponsFix(t, libs)?.apply();
    expect(t.proficiencies.individualWeapons).toEqual(['Kurzschwert']);
    expect(t.proficiencies.otherWeapons).toBe('');
  });
});

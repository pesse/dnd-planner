/**
 * Die Grenze „reiner Bogenwert vs. Deutung" — OHNE LLM, über den ECHTEN Vault.
 *
 * Der Schnitt nimmt Merkmale aus dem KI-Eingang; ein Fehlurteil verliert still einen Grant.
 * Diese Zusicherungen sind die einzige Stelle, die das bemerkt (Begründung und Messung in
 * `docs/plan/plan-zauberwirker-vereinfachung.md`, Abschnitt „Stufe 3").
 *
 *   npm run eval -- --eval sheetValueTraits
 */
import { describe, expect, it } from 'vitest';
import { getSpeciesByKey, getSpeciesList } from '../../src/lib/speciesLibrary';
import type { Trait } from '../../src/lib/schemas/species';
import { isEmptyProficiencyGrant } from '../../src/lib/schemas/grants';
import { isSheetValueTrait, withoutSheetValueTraits } from '../../src/lib/services/sheetValueTraits';
import { buildFeaturePrep } from '../../src/lib/services/wizard/featurePrep';
import { GNOME_SORCERER_BASICS } from '../fixtures/gnome-sorcerer-sage';
import { libraryKey } from '../support/libraryKey';

const allTraits = async (): Promise<{ species: string; trait: Trait }[]> => {
  const list = await getSpeciesList();
  const out: { species: string; trait: Trait }[] = [];
  for (const info of list) {
    const key = libraryKey(info);
    const spec = await getSpeciesByKey(key);
    for (const trait of spec?.traits ?? []) out.push({ species: key, trait });
  }
  return out;
};

const label = ({ species, trait }: { species: string; trait: Trait }): string => `${species} :: ${trait.name}`;

/** Signale, an denen ein Merkmal etwas zu deuten hat — nichts davon darf deklariert sein. */
const INTERPRETABLE = /\bchoose\b|\bchosen\b|\badvantage\b|\bproficien|\bresistance\b|\bspell|\byou can\b/i;

describe('reine Bogenwerte (Größe, Bewegungsrate)', () => {
  it('deklariert genau die Merkmale ohne Deutungsbedarf', async () => {
    const traits = await allTraits();
    expect(traits.length, 'Vault-Shim aktiv?').toBeGreaterThan(30);

    expect(traits.filter((t) => isSheetValueTrait(t.trait)).map(label).sort()).toEqual([
      // Die Fee kam mit dem Vault-Aufräumen dazu und wählt ihre Größe wie Mensch und Tiefling
      // („Small … or Medium …, chosen when you select this species") — nur die Rate ist fest.
      'phb-2024_fairy :: Speed',
      'srd-2024_dragonborn :: Size',
      'srd-2024_dragonborn :: Speed',
      'srd-2024_dwarf :: Size',
      'srd-2024_dwarf :: Speed',
      'srd-2024_elf :: Size',
      'srd-2024_elf :: Speed',
      'srd-2024_gnome :: Size',
      'srd-2024_gnome :: Speed',
      'srd-2024_goliath :: Size',
      'srd-2024_goliath :: Speed',
      'srd-2024_halfling :: Size',
      'srd-2024_halfling :: Speed',
      // Mensch und Tiefling WÄHLEN ihre Größe — nur ihre Bewegungsrate ist ein reiner Wert.
      'srd-2024_human :: Speed',
      'srd-2024_orc :: Size',
      'srd-2024_orc :: Speed',
      'srd-2024_tiefling :: Speed',
    ]);
  });

  it('deklariert nichts, was ein Deutungssignal trägt', async () => {
    const declared = (await allTraits()).filter((t) => isSheetValueTrait(t.trait));
    for (const t of declared) {
      const text = `${t.trait.desc} ${t.trait.descDe ?? ''}`;
      expect(INTERPRETABLE.test(text), `${label(t)}: „${t.trait.desc}"`).toBe(false);
      // Ein reiner Bogenwert gewährt genau EINES: seinen Wert. Vorher stand hier
      // `toBeUndefined()` — ohne Senke für Grundeigenschaften wäre jede Deklaration am
      // Merkmal der stille Verlust gewesen, den dieser Schnitt verursachen kann. Jetzt ist
      // die Deklaration der Weg, und die Prüfung dreht sich um: nichts ANDERES als die
      // Eigenschaft (keine Übung, kein Zaubertrick, kein TP je Stufe).
      const g = t.trait.grants;
      if (g) {
        expect(isEmptyProficiencyGrant(g.proficiencies), label(t)).toBe(true);
        expect(g.extraCantrips + g.extraPreparedCount + g.perLevel.hpMax, label(t)).toBe(0);
        expect(Object.keys(g.properties).length, `${label(t)}: setzt seinen Bogenwert`).toBeGreaterThan(0);
      }
    }
  });

  it('hält die Größen-WAHL von Mensch und Tiefling im KI-Eingang', async () => {
    for (const key of ['srd-2024_human', 'srd-2024_tiefling']) {
      const spec = await getSpeciesByKey(key);
      const kept = withoutSheetValueTraits(spec?.traits ?? []);
      expect(kept.map((t) => t.name), key).toContain('Size');
      expect(kept.map((t) => t.name), key).not.toContain('Speed');
    }
  });

  it('lässt jedes undeklarierte Merkmal durch', async () => {
    const traits = await allTraits();
    const undeclared = traits.filter((t) => !isSheetValueTrait(t.trait));
    const kept = new Set(
      (
        await Promise.all(
          [...new Set(traits.map((t) => t.species))].map(async (key) => {
            const spec = await getSpeciesByKey(key);
            return withoutSheetValueTraits(spec?.traits ?? []).map((t) => `${key} :: ${t.name}`);
          }),
        )
      ).flat(),
    );
    expect(undeclared.map(label).filter((l) => !kept.has(l))).toEqual([]);
    // Und die Merkmale, um die es geht, sind wirklich draußen.
    expect([...kept].filter((l) => /:: (Size|Speed)$/.test(l)).sort()).toEqual([
      'phb-2024_fairy :: Size',
      'srd-2024_human :: Size',
      'srd-2024_tiefling :: Size',
    ]);
  });

  /** Der Schnitt am ECHTEN Eingang: `speciesFeatures` trägt weiter alles (deutscher Speziestext). */
  it('nimmt im Wizard-Eingang genau die Bogenwerte heraus', async () => {
    const prep = await buildFeaturePrep(GNOME_SORCERER_BASICS);
    expect(prep.speciesFeatures.map((f) => f.name)).toEqual([
      'Size',
      'Speed',
      'Darkvision',
      'Gnomish Cunning',
      'Gnomish Lineage',
    ]);
    expect(prep.analysisSpeciesFeatures.map((f) => f.name)).toEqual([
      'Darkvision',
      'Gnomish Cunning',
      'Gnomish Lineage',
    ]);
    // Index-gleich zu `summarySpecies` — sonst bekäme der Speziestext fremde Keys.
    expect(prep.summarySpecies.map((s) => s.name)).toEqual(prep.speciesFeatures.map((f) => f.name));
  });

  it('greift nur am Diskriminator, nicht am Namen', () => {
    const homebrew = { name: 'Speed', desc: '30 feet' } as Trait;
    expect(isSheetValueTrait(homebrew)).toBe(false);
    expect(withoutSheetValueTraits([homebrew])).toHaveLength(1);
    expect(isSheetValueTrait({ ...homebrew, sheetValue: 'speed' })).toBe(true);
  });
});

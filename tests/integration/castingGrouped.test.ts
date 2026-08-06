/**
 * Die gruppierte Sicht (Editor UND Charakter-Karte) gegen echte Vault-Charaktere: sie muss
 * sagen, WELCHES Merkmal eine Quelle ist, WIE die Zauber gewirkt werden, WAS beim Tausch gilt
 * und WORAUS gewählt wird — vier Angaben, die sonst nur in der Deklaration stehen.
 *
 *   npm run test -- castingGrouped
 */
import { describe, expect, it } from 'vitest';
import { type Character } from '../../src/lib/schemas/characterSchema';
import { vaultCharacter } from '../support/vaultCharacter';
import { groupedSpellcasting, type SpellQuotaGroup, type SpellSourceGroup } from '../../src/lib/services/spellcasting/grouped';
import { loadSpellcasting } from '../../src/lib/services/spellcasting/project';


const sourcesOf = async (name: string): Promise<SpellSourceGroup[]> => {
  const c = vaultCharacter(name);
  const { state, lookup } = await loadSpellcasting(c);
  return groupedSpellcasting(state, lookup).sources;
};

const byFeature = (sources: SpellSourceGroup[], featureDe: string): SpellSourceGroup => {
  const hit = sources.find((s) => s.featureDe === featureDe || s.label === featureDe);
  if (!hit) throw new Error(`${featureDe} fehlt (${sources.map((s) => s.featureDe || s.label).join(', ')})`);
  return hit;
};

const only = (source: SpellSourceGroup): SpellQuotaGroup => {
  expect(source.quotas).toHaveLength(1);
  return source.quotas[0];
};

describe('gruppierte Sicht (Paladin 5 mit Eingeweihter der Magie)', () => {
  it('nennt das verantwortliche Merkmal, wo die Überschrift die Klasse zeigt', async () => {
    const sources = await sourcesOf('Bölgör');
    const classSources = sources.filter((s) => s.label === 'Paladin');
    // Drei Paladin-Quellen wären ohne das Merkmal nicht zu unterscheiden.
    expect(classSources.length).toBeGreaterThan(1);
    expect(classSources.map((s) => s.featureDe)).toContain('Treues Reittier');
    expect(classSources.every((s) => s.featureDe)).toBe(true);

    // Trägt die Überschrift schon den Merkmalsnamen, steht er nicht zweimal da.
    const feat = byFeature(sources, 'Eingeweihter der Magie');
    expect(feat.featureDe).toBe('');
  });

  it('sagt je Kontingent, wie gewirkt wird', async () => {
    const sources = await sourcesOf('Bölgör');
    expect(only(byFeature(sources, 'Treues Reittier')).castNote).toBe(
      '1× ohne Zauberplatz pro Lange Rast oder über Zauberplätze',
    );
    expect(only(byFeature(sources, 'Zauberwirken')).castNote).toBe('über Zauberplätze oder als Ritual');

    const feat = byFeature(sources, 'Eingeweihter der Magie');
    expect(feat.quotas.map((q) => q.castNote)).toEqual([
      'beliebig oft',
      '1× ohne Zauberplatz pro Lange Rast oder über Zauberplätze',
    ]);
  });

  it('sagt am wählbaren Kontingent, was beim Tausch gilt', async () => {
    const sources = await sourcesOf('Bölgör');
    expect(only(byFeature(sources, 'Zauberwirken')).swapNote).toBe('1 austauschen pro Lange Rast');
    expect(byFeature(sources, 'Eingeweihter der Magie').quotas.map((q) => q.swapNote)).toEqual([
      'nicht austauschbar',
      '1 austauschen je Stufenaufstieg',
    ]);
  });
});

describe('gruppierte Sicht (Magier 1: Vorbereitung aus dem Zauberbuch)', () => {
  it('bindet den Pool der Vorbereitung an die Buch-Quota statt an die Klassenliste', async () => {
    const source = byFeature(await sourcesOf('Bälgär'), 'Zauberwirken');
    const book = source.quotas.find((q) => q.quotaId === 'book');
    const prepared = source.quotas.find((q) => q.quotaId === 'prepared');

    // Ohne `from` bekäme der Picker die ganze Magierliste angeboten.
    expect(book?.from).toBeNull();
    expect(book?.lists).toEqual(['wizard']);
    expect(prepared?.lists).toEqual([]);
    expect(prepared?.from).toMatchObject({ sourceId: source.id, quotaId: 'book', label: 'Zauberbuch' });
    expect(prepared?.from?.spells.map((s) => s.key)).toEqual(book?.spells.map((s) => s.key));
  });
});

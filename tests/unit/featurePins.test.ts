/**
 * Gepinnte Merkmale: der Schreibpfad auf `character.pinnedFeatures` und der Weg zurück
 * von Keys zu Merkmalen.
 *
 *   npm run test -- featurePins
 */
import { describe, expect, it } from 'vitest';
import { characterSchema } from '../../src/lib/schemas/characterSchema';
import type { ResolvedCharacterFeatures } from '../../src/lib/services/characterFeatures';
import { createFeaturePins, pinnedFeatures } from '../../src/lib/services/featurePins';

const character = (over: Record<string, unknown> = {}) =>
  characterSchema.parse({ name: 'Testfigur', ...over });

const group = (title: string, keys: string[]) => ({
  title, sourceKey: `src_${title}`, unresolved: false,
  features: keys.map((key) => ({ name: key, desc: `Text zu ${key}`, key })),
});

const features = (over: Partial<ResolvedCharacterFeatures> = {}): ResolvedCharacterFeatures => ({
  speciesGroups: [], classGroups: [], backgroundGroups: [], featEntries: [], orphanChoices: [],
  ...over,
});

describe('Gepinnte Merkmale', () => {
  it('hängt einen Key an und nimmt ihn beim zweiten Klick wieder heraus', () => {
    const c = character();
    const pins = createFeaturePins(() => c);

    expect(pins.has('a')).toBe(false);
    pins.toggle('a');
    pins.toggle('b');
    expect(c.pinnedFeatures).toEqual(['a', 'b']);
    expect(pins.has('a')).toBe(true);

    pins.toggle('a');
    expect(c.pinnedFeatures).toEqual(['b']);
  });

  it('kennt ohne Merkmals-Key nichts zu pinnen', () => {
    const c = character();
    const pins = createFeaturePins(() => c);

    pins.toggle('   ');
    expect(pins.has(undefined)).toBe(false);
    expect(c.pinnedFeatures).toEqual([]);
  });

  it('liest die Merkmale in Bogen-Reihenfolge, nicht in Pin-Reihenfolge', () => {
    const f = features({
      classGroups: [group('Druide 3', ['wild-shape'])],
      speciesGroups: [group('Zwerg', ['stonecunning'])],
      featEntries: [{ name: 'Wachsam', desc: '', key: 'alert' }],
    });

    expect(pinnedFeatures(f, ['alert', 'stonecunning', 'wild-shape']).map((x) => x.key))
      .toEqual(['wild-shape', 'stonecunning', 'alert']);
  });

  it('führt dasselbe Merkmal aus zwei Quellen einmal und lässt einen Key ohne Merkmal fallen', () => {
    const f = features({
      backgroundGroups: [group('Weiser', ['magic-initiate'])],
      featEntries: [{ name: 'Eingeweihter der Magie', desc: '', key: 'magic-initiate' }],
    });

    expect(pinnedFeatures(f, ['magic-initiate', 'srd-2024_rogue_evasion']).map((x) => x.key))
      .toEqual(['magic-initiate']);
  });

  it('kostet ohne Pin keine Auflösung', () => {
    expect(pinnedFeatures(features({ classGroups: [group('Druide 3', ['wild-shape'])] }), [])).toEqual([]);
    expect(pinnedFeatures(features(), undefined)).toEqual([]);
  });
});

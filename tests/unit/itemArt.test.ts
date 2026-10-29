/**
 * Welches Bild ein Gegenstand zeigt: sein eigenes oder das über `artKey` geliehene.
 *
 *   npm run test -- itemArt
 */
import { describe, expect, it } from 'vitest';
import { itemArtUrl, itemInfoArtUrl } from '../../src/lib/libraryArt';
import { toHomebrewCopy, type ItemInfo } from '../../src/lib/itemLibrary';
import type { Item } from '../../src/lib/types';

const item = (over: Partial<Item>): Item => ({
  key: 'srd-2024_javelin',
  name: 'Javelin',
  equipment_category: { index: 'weapon', name: 'Weapon' },
  desc: [],
  source: 'srd-2024',
  document: { key: 'srd-2024', gamesystem: '' },
  ...over,
} as Item);

const info = (over: Partial<ItemInfo>): ItemInfo =>
  ({ name: 'Javelin', category: 'weapon', rarity: '—', path: 'x', magic: false, ...over });

describe('itemArtUrl', () => {
  it('nimmt das eigene Bild, SRD ohne Quellpräfix, alles andere mit ganzem Key', () => {
    expect(itemArtUrl(item({}))).toBe('/art/items/javelin.avif');
    expect(itemArtUrl(item({ key: 'efa-2025_javelin-of-returning' }))).toBe('/art/items/efa-2025_javelin-of-returning.avif');
  });

  it('leiht sich mit artKey das Bild eines anderen Gegenstands', () => {
    expect(itemArtUrl(item({ key: 'efa-2025_javelin-of-returning', artKey: 'srd-2024_javelin' })))
      .toBe('/art/items/javelin.avif');
    expect(itemInfoArtUrl(info({ key: 'homebrew-sam_speer', artKey: 'srd-2024_javelin' }))).toBe('/art/items/javelin.avif');
  });

  it('liefert ohne Key und artKey kein Bild', () => {
    expect(itemInfoArtUrl(info({}))).toBeNull();
  });
});

describe('toHomebrewCopy', () => {
  it('behält das Bild des Originals über artKey', () => {
    expect(toHomebrewCopy(item({})).artKey).toBe('srd-2024_javelin');
  });

  it('reicht ein schon geliehenes Bild weiter statt auf das Original zu zeigen', () => {
    expect(toHomebrewCopy(item({ key: 'efa-2025_x', artKey: 'srd-2024_javelin' })).artKey).toBe('srd-2024_javelin');
  });
});

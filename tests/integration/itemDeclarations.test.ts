/**
 * Kartenzeilen der Gegenstands-Deklarationen über den ECHTEN Vault: jede deklarierte Form
 * ergibt lesbaren deutschen Text.
 *
 *   npm run test -- itemDeclarations
 */
import { describe, expect, it } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { Item } from '../../src/lib/types';
import { getItemsByDir } from '../../src/lib/itemLibrary';
import { itemDeclarationLines } from '../../src/lib/services/itemDeclarations';

const byKey = async (dir: string, key: string) => {
  const item = (await getItemsByDir(dir)).find((i) => i.key === key);
  expect(item, key).toBeTruthy();
  return item!;
};

describe('Kartenzeilen der Gegenstands-Deklarationen', () => {
  it('beschreibt Mantel, Gürtel und Rüstung der Resistenz', async () => {
    const lines = async (dir: string, key: string) =>
      itemDeclarationLines(await byKey(dir, key)).map((l) => `${l.label}: ${l.text}`);
    expect(await lines('wondrous-item', 'srd-2024_cloak-of-protection')).toEqual([
      'RK: +1',
      'Rettungswurf: +1 auf alle Rettungswürfe',
    ]);
    expect(await lines('wondrous-item', 'srd-2024_belt-of-giant-strength-hill')).toEqual(['Attribut: Stärke beträgt 21']);
    const resist = await lines('armor', 'srd-2024_armor-of-resistance-plate');
    expect(resist[0]).toMatch(/^Resistenz: nach Wahl: .*Feuer/);
  });

  it('liefert für jede Vault-Deklaration Text ohne Platzhalter', async () => {
    for (const dir of ['wondrous-item', 'armor', 'weapon', 'ring', 'rod', 'staff', 'wand'])
      for (const item of await getItemsByDir(dir))
        for (const l of itemDeclarationLines(item))
          expect(l.text, `${item.key} · ${l.label}`).not.toMatch(/undefined|NaN|\[object/);
  });

  it('verträgt das rohe Datei-JSON von Karte und Tooltip, dem die Schema-Defaults fehlen', async () => {
    for (const dir of ['wondrous-item', 'armor', 'weapon', 'ring', 'rod', 'staff', 'wand'])
      for (const info of await getItemsByDir(dir)) {
        const raw = JSON.parse(await invoke<string>('read_file_content', { path: info.path })) as Item;
        expect(() => itemDeclarationLines(raw), info.key).not.toThrow();
      }
  });
});

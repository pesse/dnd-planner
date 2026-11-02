import { beforeEach, describe, expect, it, vi } from 'vitest';

let folder: { name: string; content: string | null }[] = [];

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    if (cmd === 'read_json_folder') return folder;
    throw new Error(`unerwartet: ${cmd}`);
  },
}));

const { getSourceDeclarations, invalidateSourceDeclarations, selectableSources, sourceLabel } = await import(
  '../../src/lib/services/sourceRegistry'
);
const { sourceField, toSourceKey } = await import('../../src/lib/schemas/source');

describe('deklarierte Herkünfte', () => {
  beforeEach(() => {
    folder = [
      { name: 'hellfire-club.json', content: JSON.stringify({ source: 'hellfire-club', label: 'Hellfire Club', title: 'Welcome to the Hellfire Club', ddbSourceIds: [203] }) },
      { name: 'kaputt.json', content: '{"source": "Kein Kürzel"}' },
      { name: 'leer.json', content: null },
    ];
    invalidateSourceDeclarations();
  });

  it('liest gültige Deklarationen und überspringt kaputte', async () => {
    expect((await getSourceDeclarations()).map((d) => d.source)).toEqual(['hellfire-club']);
  });

  it('beschriftet deklarierte Herkünfte, feste behalten ihren Namen', async () => {
    await getSourceDeclarations();
    expect(sourceLabel('hellfire-club')).toBe('Hellfire Club');
    expect(sourceLabel('mm-2024')).toBe('MM 2024');
    expect(sourceLabel('unbekannt-x')).toBe('unbekannt-x');
  });

  it('bietet deklarierte und die aktuelle fremde Herkunft zur Auswahl', async () => {
    await getSourceDeclarations();
    const keys = selectableSources('crooked-moon-import').map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['srd-2024', 'homebrew-sam', 'hellfire-club', 'crooked-moon-import']));
  });
});

describe('Herkunftsfeld', () => {
  it('nimmt jedes Kürzel an, aber keinen Freitext', () => {
    expect(sourceField().parse('hellfire-club')).toBe('hellfire-club');
    expect(sourceField().parse(undefined)).toBe('homebrew-sam');
    expect(sourceField().safeParse('Hellfire Club').success).toBe(false);
  });

  it('übersetzt Altbestand und fängt Freitext ab', () => {
    expect(toSourceKey('KI')).toBe('homebrew-sam');
    expect(toSourceKey('PHB-2024 (kein SRD)')).toBe('phb-2024');
    expect(toSourceKey('Irgendwas Freies')).toBe('homebrew-sam');
    expect(toSourceKey('hellfire-club')).toBe('hellfire-club');
  });
});

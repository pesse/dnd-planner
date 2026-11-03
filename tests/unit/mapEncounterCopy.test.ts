import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: Record<string, string>) => {
    switch (cmd) {
      case 'read_file_content': {
        const content = files.get(args.path);
        if (content === undefined) throw new Error(`fehlt: ${args.path}`);
        return content;
      }
      case 'write_file_content':
        files.set(args.path, args.content);
        return;
      case 'list_json_files':
        return [...files.keys()]
          .filter((p) => p.startsWith(`${args.path}/`) && !p.slice(args.path.length + 1).includes('/') && p.endsWith('.json'))
          .map((p) => p.slice(args.path.length + 1));
      default:
        throw new Error(`unerwartet: ${cmd}`);
    }
  },
}));

const { copyMapEncounters } = await import('../../src/lib/services/battleMap/mapEncounterCopy');

const FROM = './vault/campaigns/alt';
const TO = './vault/campaigns/neu';
const encounter = (slugs: string[]) => JSON.stringify({ name: 'Keller', monsters: slugs.map((slug) => ({ slug, count: 1 })) });
const map = { tokens: [{ encounter: 'k1/keller' }, { encounter: 'k1/keller' }, { encounter: '' }] } as never;

describe('copyMapEncounters', () => {
  beforeEach(() => {
    files.clear();
    files.set(`${FROM}/acts/k1/index.md`, '# Ratten im Weinkeller\n\nLanger Akttext.');
    files.set(`${FROM}/acts/k1/encounters/keller.json`, encounter(['riesenratte', 'goblin']));
    files.set(`${FROM}/acts/k1/monsters/riesenratte.json`, '{"name":"Riesenratte"}');
  });

  it('kopiert Encounter und akt-eigene Monster, legt den Akt nur mit Titel an', async () => {
    await copyMapEncounters(map, FROM, TO);
    expect(files.get(`${TO}/acts/k1/encounters/keller.json`)).toBe(encounter(['riesenratte', 'goblin']));
    expect(files.get(`${TO}/acts/k1/monsters/riesenratte.json`)).toBe('{"name":"Riesenratte"}');
    expect(files.has(`${TO}/acts/k1/monsters/goblin.json`)).toBe(false);
    expect(files.get(`${TO}/acts/k1/index.md`)).toBe('# Ratten im Weinkeller\n');
  });

  it('lässt Vorhandenes im Ziel stehen', async () => {
    files.set(`${TO}/acts/k1/index.md`, '# Eigener Akt');
    files.set(`${TO}/acts/k1/encounters/keller.json`, 'gespielt');
    files.set(`${TO}/acts/k1/monsters/riesenratte.json`, 'angepasst');
    await copyMapEncounters(map, FROM, TO);
    expect(files.get(`${TO}/acts/k1/index.md`)).toBe('# Eigener Akt');
    expect(files.get(`${TO}/acts/k1/encounters/keller.json`)).toBe('gespielt');
    expect(files.get(`${TO}/acts/k1/monsters/riesenratte.json`)).toBe('angepasst');
  });

  it('tut innerhalb derselben Kampagne nichts', async () => {
    const before = new Map(files);
    await copyMapEncounters(map, FROM, FROM);
    expect(files).toEqual(before);
  });
});

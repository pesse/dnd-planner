import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleMap } from '../../src/lib/schemas/battleMap';

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
const mapWith = (...keys: string[]) => ({ tokens: keys.map((encounter) => ({ encounter })) }) as unknown as Pick<BattleMap, 'tokens'>;
const map = mapWith('k1/keller', 'k1/keller', '');

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

  it('kopiert Encounter der ganzen Kampagne ohne Akt', async () => {
    files.set(`${FROM}/encounters/wegelagerer.json`, encounter(['bandit']));
    files.set(`${FROM}/monsters/bandit.json`, '{"name":"Bandit"}');
    await copyMapEncounters(mapWith('wegelagerer'), FROM, TO);
    expect(files.get(`${TO}/encounters/wegelagerer.json`)).toBe(encounter(['bandit']));
    expect(files.get(`${TO}/monsters/bandit.json`)).toBe('{"name":"Bandit"}');
    expect([...files.keys()].some((p) => p.startsWith(`${TO}/acts/`))).toBe(false);
  });

  it('zieht Encounter fremder Akte in den Ziel-Akt um und schreibt die Tokens um', async () => {
    files.set(`${TO}/acts/k2/index.md`, '# Zweiter Akt');
    files.set(`${FROM}/encounters/wegelagerer.json`, encounter([]));
    const placed = await copyMapEncounters(mapWith('k1/keller', 'wegelagerer'), FROM, TO, 'k2');
    expect(placed.tokens.map((t) => t.encounter)).toEqual(['k2/keller', 'wegelagerer']);
    expect(files.get(`${TO}/acts/k2/encounters/keller.json`)).toBe(encounter(['riesenratte', 'goblin']));
    expect(files.get(`${TO}/acts/k2/monsters/riesenratte.json`)).toBe('{"name":"Riesenratte"}');
    expect(files.has(`${TO}/acts/k1/encounters/keller.json`)).toBe(false);
    expect(files.get(`${TO}/encounters/wegelagerer.json`)).toBe(encounter([]));
  });

  it('zieht innerhalb derselben Kampagne nur in den Ziel-Akt um', async () => {
    const placed = await copyMapEncounters(mapWith('k1/keller'), FROM, FROM, 'k2');
    expect(placed.tokens[0].encounter).toBe('k2/keller');
    expect(files.get(`${FROM}/acts/k2/encounters/keller.json`)).toBe(encounter(['riesenratte', 'goblin']));
    expect(files.get(`${FROM}/acts/k2/index.md`)).toBe('# k2\n');
  });

  it('tut innerhalb derselben Kampagne nichts', async () => {
    const before = new Map(files);
    await copyMapEncounters(map, FROM, FROM);
    expect(files).toEqual(before);
  });
});

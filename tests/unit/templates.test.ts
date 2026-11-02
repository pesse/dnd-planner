import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();

const under = (dir: string) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: Record<string, string>) => {
    switch (cmd) {
      case 'list_entries': {
        const names = new Set(under(args.path).map((p) => p.slice(args.path.length + 1).split('/')[0]));
        return [...names].map((name) => ({ name, is_dir: under(`${args.path}/${name}`).length > 0 }));
      }
      case 'read_file_content': {
        const content = files.get(args.path);
        if (content === undefined) throw new Error(`fehlt: ${args.path}`);
        return content;
      }
      case 'write_file_content':
        files.set(args.path, args.content);
        return;
      case 'delete_path':
        files.delete(args.path);
        return;
      case 'copy_dir':
        if (under(args.to).length) throw new Error('existiert bereits');
        for (const p of under(args.from)) files.set(args.to + p.slice(args.from.length), files.get(p)!);
        return;
      default:
        throw new Error(`unerwartet: ${cmd}`);
    }
  },
}));

const { listCampaignTemplates, instantiateCampaignTemplate, freeName } = await import('$lib/services/templates/templates');

const T = './vault/templates';

beforeEach(() => {
  files.clear();
  files.set(`${T}/campaigns/hfc/template.json`, JSON.stringify({ name: 'Hellfire', characters: ['hfc-will'] }));
  files.set(`${T}/campaigns/hfc/campaign.md`, '---\ncharacters: []\n---\n# Hellfire\n');
  files.set(`${T}/campaigns/hfc/maps/karte.json`, '{}');
  files.set(`${T}/campaigns/kaputt/campaign.md`, '# ohne Kopf\n');
  files.set(`${T}/characters/hfc-will/character.json`, JSON.stringify({ name: 'Will', uid: '' }));
  files.set(`${T}/characters/hfc-will/portrait.png`, 'png');
  files.set('./vault/campaigns/hfc/campaign.md', '# schon gespielt\n');
});

describe('Kampagnen-Vorlagen', () => {
  it('listet nur Ordner mit lesbarem template.json', async () => {
    expect((await listCampaignTemplates()).map((t) => t.id)).toEqual(['hfc']);
  });

  it('kopiert neben eine vorhandene Kampagne, ohne Kopfdatei, mit neuen Charakter-UIDs', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, true);

    expect(slug).toBe('hfc-2');
    expect(files.get('./vault/campaigns/hfc/campaign.md')).toBe('# schon gespielt\n');
    expect(files.has('./vault/campaigns/hfc-2/maps/karte.json')).toBe(true);
    expect(files.has('./vault/campaigns/hfc-2/template.json')).toBe(false);

    const [uid] = under('./vault/characters').map((p) => p.split('/')[3]);
    expect(uid).not.toBe('hfc-will');
    expect(JSON.parse(files.get(`./vault/characters/${uid}/character.json`)!)).toMatchObject({ name: 'Will', uid });
    expect(files.has(`./vault/characters/${uid}/portrait.png`)).toBe(true);
    expect(files.get('./vault/campaigns/hfc-2/campaign.md')).toBe(`---\ncharacters:\n  - ${uid}\n---\n# Hellfire\n`);
  });

  it('legt ohne Charaktere keine an', async () => {
    const [template] = await listCampaignTemplates();
    await instantiateCampaignTemplate(template, false);
    expect(under('./vault/characters')).toEqual([]);
  });

  it('zählt den Ordnernamen hoch', () => {
    expect(freeName('a', new Set())).toBe('a');
    expect(freeName('a', new Set(['a', 'a-2']))).toBe('a-3');
  });
});

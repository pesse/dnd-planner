import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();

const under = (dir: string) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: Record<string, string>) => {
    switch (cmd) {
      case 'list_entries':
      case 'list_json_entries': {
        const ext = cmd === 'list_entries' ? '.md' : '.json';
        const names = new Set(under(args.path).map((p) => p.slice(args.path.length + 1).split('/')[0]));
        return [...names]
          .map((name) => ({ name, is_dir: under(`${args.path}/${name}`).length > 0 }))
          .filter((e) => e.is_dir || e.name.endsWith(ext));
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
        for (const q of under(args.path)) files.delete(q);
        return;
      case 'dir_fingerprint':
        return (args.paths as unknown as string[])
          .map((d) => under(d).sort().map((f) => `${f.slice(d.length)}=${files.get(f)}`).join('|'))
          .join('#');
      case 'rename_file':
        for (const q of under(args.oldPath)) {
          files.set(args.newPath + q.slice(args.oldPath.length), files.get(q)!);
          files.delete(q);
        }
        return;
      case 'get_absolute_path':
        return `/abs/${args.path}`;
      case 'merge_dir': {
        let copied = 0;
        for (const p of under(args.from)) {
          const to = args.to + p.slice(args.from.length);
          if (files.has(to)) continue;
          files.set(to, files.get(p)!);
          copied++;
        }
        return copied;
      }
      case 'copy_dir':
        if (under(args.to).length) throw new Error('existiert bereits');
        for (const p of under(args.from)) files.set(args.to + p.slice(args.from.length), files.get(p)!);
        return;
      default:
        throw new Error(`unerwartet: ${cmd}`);
    }
  },
  convertFileSrc: (p: string) => `asset://${p}`,
}));

const { listCampaignTemplates, listCharacterTemplates, instantiateCampaignTemplate, instantiateCharacterTemplate, freeName } = await import('$lib/services/templates/templates');

const { readProgress, setChapterCompleted, writeProgress } = await import('$lib/services/templates/chapters');
const { pendingTemplateUpdate, dismissTemplateUpdate, rebuildFromTemplate } = await import('$lib/services/templates/templateUpdate');
const { listCampaignCharacterTemplates, listOfferedCharacterTemplates, saveCharacterAsTemplate } = await import('$lib/services/templates/campaignCharacterTemplates');

const T = './vault/templates';

beforeEach(() => {
  files.clear();
  files.set(`${T}/campaigns/hfc/template.json`, JSON.stringify({ name: 'Hellfire', characters: ['hfc-will'] }));
  files.set(`${T}/campaigns/hfc/campaign.md`, '---\ncharacters: []\n---\n# Hellfire\n');
  files.set(`${T}/campaigns/hfc/maps/karte.json`, '{}');
  files.set(`${T}/campaigns/kaputt/campaign.md`, '# ohne Kopf\n');
  files.set(`${T}/characters/hfc-will/character.json`, JSON.stringify({ name: 'Will', uid: '', portraitFile: 'portrait.png' }));
  files.set(`${T}/characters/hfc-will/portrait.png`, 'png');
  files.set('./vault/campaigns/hfc/campaign.md', '# schon gespielt\n');
  files.set(`${T}/characters/lose/character.json`, JSON.stringify({ name: 'Ada', classLevel: 'Magier 1' }));
});

describe('Kampagnen-Vorlagen', () => {
  it('listet nur Ordner mit lesbarem template.json', async () => {
    expect((await listCampaignTemplates()).map((t) => t.id)).toEqual(['hfc']);
  });

  it('kopiert neben eine vorhandene Kampagne, ohne Kopfdatei, mit neuen Charakter-UIDs', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: ['hfc-will'] });

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

  it('nimmt alle Figuren der Vorlage als eigene Charaktervorlagen der Kampagne mit', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: [] });
    const own = await listCampaignCharacterTemplates(slug);
    expect(own.map((t) => [t.name, t.campaign])).toEqual([['Will', 'Kampagne „Hfc 2“']]);
    expect((await listOfferedCharacterTemplates()).map((t) => t.dir)).toEqual([
      `./vault/campaigns/${slug}/character-templates/hfc-will`,
      `${T}/characters/lose`,
      `${T}/characters/hfc-will`,
    ]);
  });

  it('speichert einen Charakter als Vorlage der Kampagne, ohne seine UID', async () => {
    files.set('./vault/characters/abc123/character.json', JSON.stringify({ name: 'Mira', uid: 'abc123' }));
    const id = await saveCharacterAsTemplate('hfc', 'abc123');
    expect(JSON.parse(files.get(`./vault/campaigns/hfc/character-templates/${id}/character.json`)!)).toEqual({ name: 'Mira', uid: '' });
  });

  it('legt die Kampagne unter dem gewählten Namen an', async () => {
    const [template] = await listCampaignTemplates();
    expect(await instantiateCampaignTemplate(template, { name: 'Freitagsrunde Süd', characters: [] })).toBe('freitagsrunde-süd');
    expect(files.has('./vault/campaigns/freitagsrunde-süd/campaign.md')).toBe(true);
  });

  it('legt ohne Charaktere keine an', async () => {
    const [template] = await listCampaignTemplates();
    await instantiateCampaignTemplate(template, { characters: [] });
    expect(under('./vault/characters')).toEqual([]);
  });

  it('hängt die Spieler-Ausgabe an ihre Spielleiter-Vorlage und kopiert nur sie', async () => {
    files.set(`${T}/campaigns/hfc-spieler/template.json`, JSON.stringify({ name: 'Hellfire (Spieler)', playerEditionOf: 'hfc', characters: ['hfc-will'] }));
    files.set(`${T}/campaigns/hfc-spieler/campaign.md`, '---\ncharacters: []\n---\n# Spoilerfrei\n');

    const list = await listCampaignTemplates();
    expect(list.map((t) => t.id)).toEqual(['hfc']);
    expect(list[0].player?.id).toBe('hfc-spieler');

    const slug = await instantiateCampaignTemplate(list[0].player!, { characters: [] });
    expect(under(`./vault/campaigns/${slug}`).filter((p) => !p.includes('/character-templates/'))).toEqual([
      `./vault/campaigns/${slug}/campaign.md`,
      `./vault/campaigns/${slug}/progress.json`,
    ]);
  });

  it('zeigt eine Spieler-Ausgabe ohne Spielleiter-Vorlage für sich', async () => {
    files.set(`${T}/campaigns/waise/template.json`, JSON.stringify({ name: 'Waise', playerEditionOf: 'fehlt' }));
    expect((await listCampaignTemplates()).map((t) => t.id)).toEqual(['hfc', 'waise']);
  });

  it('zählt den Ordnernamen hoch', () => {
    expect(freeName('a', new Set())).toBe('a');
    expect(freeName('a', new Set(['a', 'a-2']))).toBe('a-3');
  });
});

describe('Abenteuer einer Vorlage', () => {
  const chapters = [
    { id: 'eins', title: 'Eins', level: 1 },
    { id: 'zwei', title: 'Zwei', level: 3 },
  ];

  beforeEach(() => {
    files.set(`${T}/campaigns/hfc/template.json`, JSON.stringify({ name: 'Hellfire', characters: ['hfc-will'], chapters }));
    files.set(`${T}/characters/hfc-will/levels/3.json`, JSON.stringify({ name: 'Will', classLevel: 'Magier 3' }));
    files.set(`${T}/chapters/hfc/eins/npcs/gnom.md`, '# Gnom\n');
    files.set(`${T}/chapters/hfc/zwei/npcs/koenig.md`, '# König\n');
  });

  const willOf = () => {
    const path = under('./vault/characters').find((p) => p.endsWith('/character.json'))!;
    return JSON.parse(files.get(path)!);
  };

  it('beginnt beim ersten Abenteuer auf Stufe 1 und ohne Stufen-Dateien', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: ['hfc-will'] });

    expect(willOf().classLevel).toBeUndefined();
    expect(under('./vault/characters').some((p) => p.includes('/levels/'))).toBe(false);
    expect(await readProgress(slug)).toMatchObject({ template: 'hfc', completed: [] });
    expect(files.has(`./vault/campaigns/${slug}/npcs/gnom.md`)).toBe(false);
  });

  it('steigt später ein: Stufe des Abenteuers, frühere gelten als gespielt', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: ['hfc-will'], startChapter: 'zwei' });

    expect(willOf()).toMatchObject({ classLevel: 'Magier 3' });
    expect(await readProgress(slug)).toMatchObject({ template: 'hfc', completed: ['eins'] });
    expect(files.get(`./vault/campaigns/${slug}/npcs/gnom.md`)).toBe('# Gnom\n');
    expect(files.has(`./vault/campaigns/${slug}/npcs/koenig.md`)).toBe(false);
  });

  it('liefert beim Abhaken nach, ohne Eigenes zu überschreiben, und löscht beim Zurücknehmen nichts', async () => {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: [] });
    files.set(`./vault/campaigns/${slug}/npcs/gnom.md`, '# Unser Gnom\n');

    let progress = (await readProgress(slug))!;
    progress = await setChapterCompleted(slug, progress, 'eins', true);
    expect(files.get(`./vault/campaigns/${slug}/npcs/gnom.md`)).toBe('# Unser Gnom\n');

    progress = await setChapterCompleted(slug, progress, 'zwei', true);
    expect(files.get(`./vault/campaigns/${slug}/npcs/koenig.md`)).toBe('# König\n');

    await setChapterCompleted(slug, progress, 'zwei', false);
    expect(await readProgress(slug)).toMatchObject({ template: 'hfc', completed: ['eins'] });
    expect(files.has(`./vault/campaigns/${slug}/npcs/koenig.md`)).toBe(true);
  });

  it('merkt sich auch ohne Abenteuer, aus welcher Vorlage die Kampagne stammt', async () => {
    files.set(`${T}/campaigns/hfc/template.json`, JSON.stringify({ name: 'Hellfire' }));
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: [] });
    expect(await readProgress(slug)).toMatchObject({ template: 'hfc', completed: [] });
  });
});

describe('Geänderte Vorlage', () => {
  const chapters = [{ id: 'eins', title: 'Eins', level: 1 }];

  beforeEach(() => {
    files.set(`${T}/campaigns/hfc/template.json`, JSON.stringify({ name: 'Hellfire', characters: ['hfc-will'], chapters }));
    files.set(`${T}/chapters/hfc/eins/npcs/gnom.md`, '# Gnom\n');
  });

  async function created() {
    const [template] = await listCampaignTemplates();
    const slug = await instantiateCampaignTemplate(template, { characters: ['hfc-will'] });
    await setChapterCompleted(slug, (await readProgress(slug))!, 'eins', true);
    files.set(`./vault/campaigns/${slug}/sessions/eins.md`, '# Unsere Session\n');
    return slug;
  }

  it('meldet sich erst, wenn das Pack die Vorlage geändert hat', async () => {
    const slug = await created();
    expect(await pendingTemplateUpdate(slug)).toBeNull();
    files.set(`${T}/campaigns/hfc/maps/karte.json`, '{"neu":true}');
    expect(await pendingTemplateUpdate(slug)).toMatchObject({ template: { id: 'hfc' } });
  });

  it('nimmt eine Kampagne ohne Fingerabdruck mit dem heutigen Stand auf', async () => {
    const slug = await created();
    const { templateFingerprint: _, ...legacy } = (await readProgress(slug))!;
    await writeProgress(slug, legacy);
    expect(await pendingTemplateUpdate(slug)).toBeNull();
    expect((await readProgress(slug))!.templateFingerprint).toBeTruthy();
  });

  it('schweigt nach „Ignorieren" bis zur nächsten Änderung', async () => {
    const slug = await created();
    files.set(`${T}/campaigns/hfc/maps/karte.json`, '{"neu":true}');
    await dismissTemplateUpdate(slug, (await pendingTemplateUpdate(slug))!);
    expect(await pendingTemplateUpdate(slug)).toBeNull();
    files.set(`${T}/campaigns/hfc/maps/karte.json`, '{"neuer":true}');
    expect(await pendingTemplateUpdate(slug)).not.toBeNull();
  });

  it('überschreibt an Ort und Stelle: neue Vorlage, dieselben Charaktere und Abenteuer, Eigenes weg', async () => {
    const slug = await created();
    const before = files.get(`./vault/campaigns/${slug}/campaign.md`);
    files.set(`${T}/campaigns/hfc/maps/karte.json`, '{"neu":true}');

    expect(await rebuildFromTemplate(slug, (await pendingTemplateUpdate(slug))!, true)).toBe(slug);
    expect(files.get(`./vault/campaigns/${slug}/maps/karte.json`)).toBe('{"neu":true}');
    expect(files.get(`./vault/campaigns/${slug}/campaign.md`)).toBe(before);
    expect(files.get(`./vault/campaigns/${slug}/npcs/gnom.md`)).toBe('# Gnom\n');
    expect(files.has(`./vault/campaigns/${slug}/sessions/eins.md`)).toBe(false);
    expect(await readProgress(slug)).toMatchObject({ completed: ['eins'] });
    expect(await pendingTemplateUpdate(slug)).toBeNull();
    expect(under('./vault/campaigns').some((p) => p.startsWith(`./vault/campaigns/${slug}-`))).toBe(false);
  });

  it('legt neu an und lässt die alte Kampagne stehen', async () => {
    const slug = await created();
    files.set(`${T}/campaigns/hfc/maps/karte.json`, '{"neu":true}');

    const copy = await rebuildFromTemplate(slug, (await pendingTemplateUpdate(slug))!, false);
    expect(copy).not.toBe(slug);
    expect(files.get(`./vault/campaigns/${copy}/maps/karte.json`)).toBe('{"neu":true}');
    expect(files.get(`./vault/campaigns/${slug}/sessions/eins.md`)).toBe('# Unsere Session\n');
    expect(files.get(`./vault/campaigns/${copy}/campaign.md`)).toBe(files.get(`./vault/campaigns/${slug}/campaign.md`));
  });
});

describe('Charakter-Vorlagen', () => {
  it('ordnet sie ihrer Kampagnen-Vorlage zu und zeigt das Porträt', async () => {
    const list = await listCharacterTemplates();
    expect(list.map((t) => [t.id, t.campaign])).toEqual([['lose', ''], ['hfc-will', 'Hellfire']]);
    expect(list[1].portraitSrc).toMatch(/^asset:\/\/\/abs\/.*hfc-will\/portrait\.png/);
    expect(list[0]).toMatchObject({ name: 'Ada', classLevel: 'Magier 1', portraitSrc: '' });
  });

  it('führt die Stufen einer Vorlage und legt sie auf der gewählten an', async () => {
    files.set(`${T}/characters/lose/levels/3.json`, JSON.stringify({ name: 'Ada', classLevel: 'Magier 3' }));
    files.set(`${T}/characters/lose/levels/notiz.txt`, 'kein Level');
    const ada = (await listCharacterTemplates()).find((t) => t.id === 'lose')!;
    expect(ada.levels).toEqual([{ level: 1, classLevel: 'Magier 1' }, { level: 3, classLevel: 'Magier 3' }]);

    const uid = await instantiateCharacterTemplate(`${T}/characters/lose`, 3);
    expect(JSON.parse(files.get(`./vault/characters/${uid}/character.json`)!)).toMatchObject({ classLevel: 'Magier 3', uid });
    expect(under(`./vault/characters/${uid}/levels`)).toEqual([]);
  });
});

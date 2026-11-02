import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { campaignTemplateSchema } from '$lib/schemas/template';
import { encounterSchema } from '$lib/schemas/encounter';
import { battleMapSchema } from '$lib/schemas/battleMap';
import { characterSchema } from '$lib/schemas/characterSchema';
import { pendingCharacterUpgrade, upgradeCharacter } from '$lib/schemas/characterUpgrades';
import { loadSpellcasting, openSpellChoices } from '$lib/services/spellcasting/project';

const VAULT = 'vault';
const TEMPLATES = join(VAULT, 'templates/campaigns');
const CHARACTER_TEMPLATES = join(VAULT, 'templates/characters');

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const librarySlugs = new Set(walk(join(VAULT, 'monsters')).map((p) => p.split('/').pop()!.replace(/\.json$/, '')));
const templates = existsSync(TEMPLATES) ? readdirSync(TEMPLATES) : [];

// Eine Vorlage hat keine akt-lokalen Monster: was ein Encounter oder Token nennt, muss die Bibliothek führen.
describe.each(templates)('Kampagnen-Vorlage %s', (id) => {
  const dir = join(TEMPLATES, id);
  const files = walk(dir);

  it('hat ein gültiges template.json und eine campaign.md', () => {
    expect(campaignTemplateSchema.safeParse(JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'))).success).toBe(true);
    expect(existsSync(join(dir, 'campaign.md'))).toBe(true);
  });

  it('Encounter sind gültig und zeigen auf Bibliotheksmonster', () => {
    for (const f of files.filter((p) => /\/encounters\/[^/]+\.json$/.test(p))) {
      const enc = encounterSchema.parse(JSON.parse(readFileSync(f, 'utf8')));
      expect(enc.monsters.map((m) => m.slug).filter((s) => !librarySlugs.has(s)), f).toEqual([]);
    }
  });

  it('Karten sind gültig und ihre Monster-Tokens auflösbar', () => {
    for (const f of files.filter((p) => /\/maps\/[^/]+\.json$/.test(p))) {
      const map = battleMapSchema.parse(JSON.parse(readFileSync(f, 'utf8')));
      expect(existsSync(join(dir, 'maps', map.image)), f).toBe(true);
      const refs = map.tokens.filter((t) => t.kind === 'monster' && t.ref).map((t) => t.ref!);
      expect(refs.filter((r) => !librarySlugs.has(r)), f).toEqual([]);
    }
  });

  it('enthält keine akt-lokalen Monster', () => {
    expect(files.filter((p) => /\/acts\/[^/]+\/monsters\//.test(p))).toEqual([]);
  });
});

const characterTemplates = existsSync(CHARACTER_TEMPLATES) ? readdirSync(CHARACTER_TEMPLATES) : [];

it('jede Kampagnen-Vorlage nennt nur vorhandene Charakter-Vorlagen', () => {
  const named = templates.flatMap((id) => JSON.parse(readFileSync(join(TEMPLATES, id, 'template.json'), 'utf8')).characters as string[]);
  expect(named.filter((c) => !characterTemplates.includes(c))).toEqual([]);
});

// Vorgefertigte Charaktere werden beim Anlegen nur kopiert — was hier offen bleibt, sieht jeder Spieler.
describe.each(characterTemplates)('Charakter-Vorlage %s', (id) => {
  const raw = JSON.parse(readFileSync(join(CHARACTER_TEMPLATES, id, 'character.json'), 'utf8'));
  const c = characterSchema.parse(upgradeCharacter(raw).data);

  it('ist auf dem aktuellen Stand und hat ihr Porträt', () => {
    expect(pendingCharacterUpgrade(raw)).toBeNull();
    if (c.portraitFile) expect(existsSync(join(CHARACTER_TEMPLATES, id, c.portraitFile))).toBe(true);
  });

  it('hat alle Zauberwahlen getroffen, ohne Zusatzbestand', async () => {
    const { state, lookup } = await loadSpellcasting(c);
    expect(openSpellChoices(state, lookup)).toEqual([]);
    expect(state.issues).toEqual([]);
    expect(c.spellcasting.manual?.extra ?? []).toEqual([]);
  });
});

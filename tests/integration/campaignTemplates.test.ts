import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { campaignTemplateSchema } from '$lib/schemas/template';
import { encounterSchema } from '$lib/schemas/encounter';
import { battleMapSchema } from '$lib/schemas/battleMap';
import { characterSchema } from '$lib/schemas/characterSchema';
import { pendingCharacterUpgrade, upgradeCharacter } from '$lib/schemas/characterUpgrades';
import { loadSpellcasting, openSpellChoices } from '$lib/services/spellcasting/project';
import { buildCharacterChoices, choiceIdOf, collectChoiceSlots } from '$lib/services/characterChoices';
import { formatClassLevel } from '$lib/schemas/classLevelText';
import { hpBasisOf, hpMaxTotal, loadHpLibraryParts } from '$lib/services/hitPoints';

const VAULT = 'vault';
const TEMPLATES = join(VAULT, 'templates/campaigns');
const CHARACTER_TEMPLATES = join(VAULT, 'templates/characters');
const CHAPTERS = join(VAULT, 'templates/chapters');

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

  it('jede Figur gibt es auf der Stufe jedes Abenteuers', () => {
    const t = campaignTemplateSchema.parse(JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8')));
    const missing = t.chapters
      .filter((ch) => ch.level > 1)
      .flatMap((ch) => t.characters.map((c) => join(CHARACTER_TEMPLATES, c, 'levels', `${ch.level}.json`)))
      .filter((p) => !existsSync(p));
    expect(missing).toEqual([]);
  });

  // Nachgeliefert wird nur, was Spieler sehen dürfen: Akte, Karten und Encounter bleiben bei der Spielleitung.
  it('liefert nach abgeschlossenen Abenteuern nur NSCs, Welt und Notizen nach', () => {
    const t = campaignTemplateSchema.parse(JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8')));
    const unlocks = join(CHAPTERS, id);
    if (!existsSync(unlocks)) return;
    expect(readdirSync(unlocks).filter((c) => !t.chapters.some((ch) => ch.id === c))).toEqual([]);
    const rel = walk(unlocks).map((p) => p.slice(unlocks.length + 1).split('/').slice(1).join('/'));
    expect(rel.filter((p) => !/^(npcs|world|notes)\/[^/]+\.md$/.test(p))).toEqual([]);
    if (t.playerEditionOf) expect(rel.filter((p) => existsSync(join(dir, p)))).toEqual([]);
  });
});

const characterTemplates = existsSync(CHARACTER_TEMPLATES) ? readdirSync(CHARACTER_TEMPLATES) : [];

it('jede Kampagnen-Vorlage nennt nur vorhandene Charakter-Vorlagen', () => {
  const named = templates.flatMap((id) => JSON.parse(readFileSync(join(TEMPLATES, id, 'template.json'), 'utf8')).characters as string[]);
  expect(named.filter((c) => !characterTemplates.includes(c))).toEqual([]);
});

/** Jede Stufenfassung unter `levels/<stufe>.json` ist eine eigene, vollständige Vorlage. */
const characterFiles = characterTemplates.flatMap((id) => {
  const levels = join(CHARACTER_TEMPLATES, id, 'levels');
  const extra = existsSync(levels) ? readdirSync(levels).map((f) => `levels/${f}`) : [];
  return ['character.json', ...extra].map((file) => [`${id}/${file}`, id, file] as const);
});

// TP-Maxima der offiziellen Bögen (Anhang D), Stufe 1 bis 3.
const OFFICIAL_HP: Record<string, number[]> = {
  'hellfire-club-will': [9, 16, 23],
  'hellfire-club-nog': [12, 21, 30],
  'hellfire-club-sundar': [15, 26, 37],
  'hellfire-club-applejack': [10, 17, 24],
  'hellfire-club-tayr': [11, 18, 25],
};

// Vorgefertigte Charaktere werden beim Anlegen nur kopiert — was hier offen bleibt, sieht jeder Spieler.
describe.each(characterFiles)('Charakter-Vorlage %s', (_label, id, file) => {
  const raw = JSON.parse(readFileSync(join(CHARACTER_TEMPLATES, id, file), 'utf8'));
  const c = characterSchema.parse(upgradeCharacter(raw).data);
  const level = file === 'character.json' ? 1 : Number(file.match(/(\d+)\.json$/)?.[1]);

  it('ist auf dem aktuellen Stand und hat ihr Porträt', () => {
    expect(pendingCharacterUpgrade(raw)).toBeNull();
    if (c.portraitFile) expect(existsSync(join(CHARACTER_TEMPLATES, id, c.portraitFile))).toBe(true);
  });

  it('steht auf der Stufe ihrer Datei', () => {
    expect(c.classes.reduce((sum, cls) => sum + cls.level, 0)).toBe(level);
    expect(c.classLevel).toBe(formatClassLevel(c.classes));
  });

  it('hat die TP des offiziellen Bogens', async () => {
    const official = OFFICIAL_HP[id]?.[level - 1];
    if (official === undefined) return;
    const basis = hpBasisOf(c.classes, c.mods.con, await loadHpLibraryParts(c));
    expect(hpMaxTotal(c, basis)).toBe(official);
  });

  it('hat alle Zauberwahlen getroffen, ohne Zusatzbestand', async () => {
    const { state, lookup } = await loadSpellcasting(c);
    expect(openSpellChoices(state, lookup)).toEqual([]);
    expect(state.issues).toEqual([]);
    expect(c.spellcasting.manual?.extra ?? []).toEqual([]);
  });

  it('hat alle Merkmalswahlen getroffen', async () => {
    const { slots } = await collectChoiceSlots(c);
    const open = buildCharacterChoices(slots, { proficient: [], ledger: c.features }).filter((ch) => ch.open);
    expect(open.map((ch) => choiceIdOf(ch.slot))).toEqual([]);
  });

  // Sonst bietet der Editor sofort „Alles umstellen" für die TP-Aufschlüsselung an.
  it('führt die TP als Würfelsumme', () => {
    expect(c.hpDiceTotal).toBeGreaterThan(0);
    expect(c.hpMax).toBe('');
  });
});

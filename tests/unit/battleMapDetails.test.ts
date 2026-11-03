import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import { OVERVIEW_ONLY, forgetToken, popDetail, pushDetail } from '../../src/lib/services/battleMap/detailStack';
import { adjustHp, campaignDirOf, concentrationDc, encounterKeyOf, encounterPath, isBloodied, mapEncounters } from '../../src/lib/services/battleMap/tokenDetails';
import { shortName } from '../../src/lib/services/battleMap/tokenSources';
import { toPlayerState } from '../../src/lib/services/battleMap/playerState';
import { asMapTemplate, isMapTemplatePath } from '../../src/lib/services/battleMap/mapTemplates';
import { ruleIconUrl } from '../../src/lib/conditionIcon';
import { advanceTurn, initiativeOrder, startCombat } from '../../src/lib/services/battleMap/initiative';
import { encounterXp, scopeDirOf, withMonsterCount, withRestored } from '../../src/lib/services/battleMap/encounterEdit';
import { missingMonsters } from '../../src/lib/services/battleMap/tokenSources';
import { formatMonsterList } from '../../src/lib/services/contextLoad';
import { encounterSchema } from '../../src/lib/schemas/encounter';

const token = (id: string) => ({ kind: 'token', id }) as const;

describe('Detailverlauf der Karte', () => {
  it('geht über Links vor und mit Zurück wieder zurück', () => {
    let s = pushDetail(OVERVIEW_ONLY, token('a'));
    s = pushDetail(s, { kind: 'encounter', key: 'akt-1/goblins' });
    s = pushDetail(s, { kind: 'entry', entry: { name: 'Goblin', type: 'monster', path: './vault/monsters/goblin.json' } });
    expect(s).toHaveLength(4);
    expect(popDetail(popDetail(s)).at(-1)).toEqual(token('a'));
  });

  it('legt dasselbe Ziel nicht doppelt hintereinander ab und behält die Übersicht als Boden', () => {
    const s = pushDetail(pushDetail(OVERVIEW_ONLY, token('a')), token('a'));
    expect(s).toHaveLength(2);
    expect(popDetail(popDetail(s))).toEqual(OVERVIEW_ONLY);
  });

  it('vergisst ein gelöschtes Token, ohne Nachbarn zu verdoppeln', () => {
    const s = [token('a'), token('b'), token('a')].reduce(pushDetail, OVERVIEW_ONLY);
    expect(forgetToken(s, 'b')).toEqual([{ kind: 'overview' }, token('a')]);
  });

  it('begrenzt den Verlauf, die Übersicht bleibt unten', () => {
    const s = Array.from({ length: 50 }, (_, i) => token(String(i))).reduce(pushDetail, OVERVIEW_ONLY);
    expect(s).toHaveLength(30);
    expect(s[0]).toEqual({ kind: 'overview' });
    expect(s.at(-1)).toEqual(token('49'));
  });
});

describe('Encounter-Verweis am Token', () => {
  it('bleibt beim Kopieren der Kampagne gültig, weil er relativ zur Kampagne ist', () => {
    const dir = campaignDirOf('./vault/campaigns/hellfire-club-2/maps/gruft.json');
    expect(dir).toBe('./vault/campaigns/hellfire-club-2');
    const path = encounterPath(dir, 'akt-1/goblins');
    expect(path).toBe('./vault/campaigns/hellfire-club-2/acts/akt-1/encounters/goblins.json');
    expect(encounterKeyOf(path)).toBe('akt-1/goblins');
  });

  it('kennt Encounter der ganzen Kampagne am Schlüssel ohne Akt', () => {
    const path = encounterPath('./vault/campaigns/hellfire-club-2', 'wegelagerer');
    expect(path).toBe('./vault/campaigns/hellfire-club-2/encounters/wegelagerer.json');
    expect(encounterKeyOf(path)).toBe('wegelagerer');
  });

  it('schickt Notiz und Encounter nicht ans Spielerfenster', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [
        { id: 'c', name: 'Falltür', kind: 'marker', x: 3, y: 3, note: 'Geheimgang nach Norden', encounter: 'akt-1/falle' },
        { id: 'g', name: 'Goblin', kind: 'monster', x: 1, y: 1, hp: 3, hpMax: 7 },
      ],
    });
    expect(JSON.stringify(toPlayerState(map, '', {}))).not.toMatch(/Geheimgang|akt-1|hp/i);
  });

  it('zeigt eine Falle erst entdeckt, ohne Bibliotheks-Key, Stufe oder Zustand außer „entschärft"', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [
        { id: 'a', name: 'Grube', kind: 'trap', ref: 'srd-2024_hidden-pit', x: 1, y: 1, hidden: true },
        { id: 'b', name: 'Nadel', kind: 'trap', ref: 'srd-2024_poisoned-needle', x: 2, y: 1, trapState: 'disarmed' },
      ],
    });
    const { tokens } = toPlayerState(map, '', {});
    expect(tokens.map((t) => [t.id, t.down])).toEqual([['b', true]]);
    expect(JSON.stringify(tokens)).not.toMatch(/srd-2024|trapState|trapTier/);
  });

  it('zeigt den Spielern Besiegte, aber keine TP', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [
        { id: 'g', name: 'Goblin', kind: 'monster', x: 1, y: 1, hp: 0, hpMax: 7 },
        { id: 'o', name: 'Ork', kind: 'monster', x: 2, y: 1, hp: 4, hpMax: 15 },
      ],
    });
    const { tokens } = toPlayerState(map, '', {});
    expect(tokens.map((t) => t.down)).toEqual([true, false]);
    expect(JSON.stringify(tokens)).not.toMatch(/"hp/);
  });
});

describe('Trefferpunkte eines Monster-Tokens', () => {
  it('zieht Schaden bis 0 ab und heilt höchstens bis zum Maximum', () => {
    expect(adjustHp({ hp: 5, hpMax: 7 }, 0, -9)).toEqual({ hp: 0, hpMax: 7 });
    expect(adjustHp({ hp: 5, hpMax: 7 }, 0, 4)).toEqual({ hp: 7, hpMax: 7 });
  });

  it('beginnt bei alten Tokens ohne gezählte TP mit vollen TP aus dem Werteblock', () => {
    expect(adjustHp({ hp: null, hpMax: null }, 11, -4)).toEqual({ hp: 7, hpMax: 11 });
  });
});

describe('Initiative und Zugwechsel', () => {
  const t = (id: string, initiative: number | null, hp: number | null = null) => ({ id, name: id, initiative, hp });
  const tokens = [t('ork', 12), t('ada', 17), t('gob', 12, 0), t('zed', null)];

  it('ordnet nach Initiative absteigend und lässt Tokens ohne Wert weg', () => {
    expect(initiativeOrder(tokens).map((x) => x.id)).toEqual(['ada', 'gob', 'ork']);
  });

  it('überspringt Besiegte und beginnt nach dem Letzten eine neue Runde', () => {
    let c = startCombat(tokens);
    expect(c).toEqual({ round: 1, turn: 'ada' });
    c = advanceTurn(tokens, c, 1);
    expect(c).toEqual({ round: 1, turn: 'ork' });
    c = advanceTurn(tokens, c, 1);
    expect(c).toEqual({ round: 2, turn: 'ada' });
    expect(advanceTurn(tokens, c, -1)).toEqual({ round: 1, turn: 'ork' });
  });

  it('geht vor der ersten Runde nicht weiter zurück', () => {
    expect(advanceTurn(tokens, { round: 1, turn: 'ada' }, -1)).toEqual({ round: 1, turn: 'ada' });
  });

  it('zeigt den Spielern nicht, dass ein verstecktes Token am Zug ist', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [{ id: 'g', name: 'Goblin', kind: 'monster', x: 1, y: 1, hidden: true, initiative: 15, conditions: ['prone'] }],
      combat: { round: 1, turn: 'g' },
    });
    const state = toPlayerState(map, '', {});
    expect(state.turn).toBe('');
    expect(JSON.stringify(state)).not.toMatch(/initiative/);
  });
});

describe('Beschriftung und Zustand eines Tokens', () => {
  it('kürzt Namen auf der Karte, laufende Nummern bleiben stehen', () => {
    expect(shortName('Goblin-Krieger 3')).toBe('Goblin-… 3');
    expect(shortName('Ada Prüfling')).toBe('Ada');
    expect(shortName('Oger')).toBe('Oger');
  });

  it('ist blutig bei höchstens halben TP, aber nicht besiegt', () => {
    expect(isBloodied({ hp: 34, hpMax: 68 })).toBe(true);
    expect(isBloodied({ hp: 35, hpMax: 68 })).toBe(false);
    expect(isBloodied({ hp: 0, hpMax: 68 })).toBe(false);
    expect(isBloodied({ hp: null, hpMax: null })).toBe(false);
  });

  it('verlangt für Konzentration SG 10 oder halben Schaden, höchstens 30', () => {
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(25)).toBe(12);
    expect(concentrationDc(90)).toBe(30);
  });
});

describe('Karte als Vorlage', () => {
  const map = battleMapSchema.parse({
    name: 'Gruft',
    tokens: [
      { id: 'c', name: 'Ada Prüfling', kind: 'character', ref: 'abc', x: 1, y: 1, initiative: 17 },
      { id: 'g', name: 'Goblin', kind: 'monster', x: 2, y: 1, hp: 2, hpMax: 7, conditions: ['prone'], effects: ['burning'], initiative: 12, encounter: 'akt-1/goblins' },
      { id: 'm', name: 'Falltür', kind: 'marker', x: 3, y: 3, hidden: true, note: 'Geheimgang' },
    ],
    fog: { enabled: true, ops: [{ shape: 'rect', mode: 'reveal', x: 0, y: 0, w: 5, h: 5 }] },
    combat: { round: 3, turn: 'g' },
  });

  it('lässt Spieler-Charaktere und Spielgeschehen weg, Vorbereitung bleibt', () => {
    const t = asMapTemplate(map);
    expect(t.tokens.map((x) => x.id)).toEqual(['g', 'm']);
    expect(t.tokens[0]).toMatchObject({ hp: 7, hpMax: 7, conditions: [], effects: [], initiative: null, hidden: true, encounter: 'akt-1/goblins' });
    expect(t.tokens[1]).toMatchObject({ hidden: true, note: 'Geheimgang' });
    expect(t.fog).toEqual({ enabled: true, ops: [] });
    expect(t.combat).toEqual({ round: 0, turn: '' });
  });

  it('stellt Fallen wieder scharf und verborgen auf, die gewählte Stufe bleibt', () => {
    const withTrap = battleMapSchema.parse({
      name: 'Gruft',
      tokens: [{ id: 't', name: 'Grube', kind: 'trap', ref: 'srd-2024_hidden-pit', x: 0, y: 0, trapState: 'triggered', trapTier: 2 }],
    });
    expect(asMapTemplate(withTrap).tokens[0]).toMatchObject({ trapState: 'armed', hidden: true, trapTier: 2 });
  });

  it('löst Encounter auch aus einer Vorlage in derselben Kampagne auf', () => {
    const path = './vault/campaigns/hellfire-club/map-templates/gruft.json';
    expect(isMapTemplatePath(path)).toBe(true);
    expect(isMapTemplatePath('./vault/campaigns/hellfire-club/maps/gruft.json')).toBe(false);
    expect(campaignDirOf(path)).toBe('./vault/campaigns/hellfire-club');
  });
});

describe('Icon eines Regeleintrags', () => {
  it('gibt es nur für Zustände und Effekte der Kampfkarte', () => {
    expect(ruleIconUrl({ key: 'srd-2024_incapacitated' })).toBe('/branding/conditions/incapacitated.webp');
    expect(ruleIconUrl({ key: 'srd-2024_burning' })).toBe('/branding/conditions/burning.webp');
    expect(ruleIconUrl({ key: 'srd-2024_bloodied' })).toBeNull();
    expect(ruleIconUrl({ key: 'srd-2024_initiative' })).toBeNull();
  });
});

describe('Encounter einer Karte', () => {
  const all = [
    { actSlug: 'akt-1', slug: 'goblins' },
    { actSlug: 'akt-2', slug: 'ratten' },
    { actSlug: 'akt-2', slug: 'wexley' },
    { actSlug: '', slug: 'wegelagerer' },
  ];

  it('bietet einer Vorlage alle Encounter an', () => {
    const map = battleMapSchema.parse({ name: 'x' });
    expect(mapEncounters(all, map, true).map((e) => e.key)).toEqual(['akt-1/goblins', 'akt-2/ratten', 'akt-2/wexley', 'wegelagerer']);
  });

  it('bietet einer Karte ohne Akt nur die Encounter der ganzen Kampagne an', () => {
    const map = battleMapSchema.parse({ name: 'x' });
    expect(mapEncounters(all, map, false).map((e) => e.key)).toEqual(['wegelagerer']);
  });

  it('beschränkt sich auf die Akte der Karte und die Kampagne, behält aber schon gesetzte Encounter', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      acts: ['akt-2'],
      tokens: [{ id: 'g', name: 'Goblin', kind: 'monster', x: 1, y: 1, encounter: 'akt-1/goblins' }],
    });
    expect(mapEncounters(all, map, false).map((e) => e.key)).toEqual(['akt-1/goblins', 'akt-2/ratten', 'akt-2/wexley', 'wegelagerer']);
    expect(mapEncounters(all, { ...map, tokens: [] }, false).map((e) => e.key)).toEqual(['akt-2/ratten', 'akt-2/wexley', 'wegelagerer']);
  });
});

describe('withMonsterCount', () => {
  const base = encounterSchema.parse({ name: 'Hinterhalt', monsters: [{ slug: 'goblin', count: 2, notes: 'im Gebüsch' }] });

  it('zählt hoch und behält die Notiz', () => {
    expect(withMonsterCount(base, 'goblin', 1).monsters).toEqual([{ slug: 'goblin', count: 3, notes: 'im Gebüsch' }]);
  });

  it('hängt ein neues Monster ans Ende', () => {
    expect(withMonsterCount(base, 'wolf', 1).monsters.map((m) => [m.slug, m.count])).toEqual([['goblin', 2], ['wolf', 1]]);
  });

  it('entfernt bei 0 und ignoriert Abzug bei Fehlendem', () => {
    expect(withMonsterCount(base, 'goblin', -2).monsters).toEqual([]);
    expect(withMonsterCount(base, 'wolf', -1).monsters).toEqual(base.monsters);
  });
});

describe('Encounter im Cockpit', () => {
  const enc = encounterSchema.parse({
    name: 'Brücke',
    monsters: [
      { slug: 'goblin', count: 3 },
      { slug: 'oger', count: 1 },
    ],
  });

  it('setzt nur, was noch nicht auf der Karte steht', () => {
    expect(missingMonsters(enc, [{ ref: 'goblin' }, { ref: 'goblin' }, { ref: 'oger' }])).toEqual([
      { slug: 'goblin', already: 2, missing: 1 },
      { slug: 'oger', already: 1, missing: 0 },
    ]);
    expect(missingMonsters(enc, [{ ref: 'oger' }, { ref: 'oger' }])[1].missing).toBe(0);
  });

  it('summiert EP über die Anzahl, Unbekannte zählen nicht', () => {
    expect(encounterXp(enc.monsters, (s) => ({ goblin: 50, oger: 450 })[s])).toBe(600);
    expect(encounterXp(enc.monsters, (s) => (s === 'goblin' ? 50 : undefined))).toBe(150);
  });

  it('setzt einen entfernten Eintrag an seine alte Stelle zurück', () => {
    const without = withMonsterCount(enc, 'goblin', -3);
    expect(withRestored(without, enc.monsters[0], 0).monsters).toEqual(enc.monsters);
  });

  it('formatiert die Monsterliste der Übersicht', () => {
    expect(formatMonsterList(enc.monsters, (s) => (s === 'goblin' ? { name: 'Goblin', cr: 0.25 } : undefined))).toBe('3× Goblin (HG 1/4), 1× oger');
  });

  it('kennt den Ordner, dessen Monster den Encounter überschreiben', () => {
    expect(scopeDirOf('./vault/campaigns/k/acts/a1/encounters/brücke.json')).toBe('./vault/campaigns/k/acts/a1');
    expect(scopeDirOf('./vault/campaigns/k/encounters/brücke.json')).toBe('./vault/campaigns/k');
  });
});

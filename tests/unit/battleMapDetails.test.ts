import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import { OVERVIEW_ONLY, forgetToken, popDetail, pushDetail } from '../../src/lib/services/battleMap/detailStack';
import { adjustHp, campaignDirOf, encounterKeyOf, encounterPath } from '../../src/lib/services/battleMap/tokenDetails';
import { toPlayerState } from '../../src/lib/services/battleMap/playerState';
import { advanceTurn, initiativeOrder, startCombat } from '../../src/lib/services/battleMap/initiative';

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

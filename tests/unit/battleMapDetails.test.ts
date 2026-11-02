import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import { OVERVIEW_ONLY, forgetToken, popDetail, pushDetail } from '../../src/lib/services/battleMap/detailStack';
import { campaignDirOf, encounterKeyOf, encounterPath } from '../../src/lib/services/battleMap/tokenDetails';
import { toPlayerState } from '../../src/lib/services/battleMap/playerState';

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
      tokens: [{ id: 'c', name: 'Falltür', kind: 'marker', x: 3, y: 3, note: 'Geheimgang nach Norden', encounter: 'akt-1/falle' }],
    });
    expect(JSON.stringify(toPlayerState(map, '', {}))).not.toMatch(/Geheimgang|akt-1/);
  });
});

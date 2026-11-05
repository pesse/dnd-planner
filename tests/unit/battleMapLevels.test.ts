import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import { addLevel, layerOf, levelBelow, levelStack, mapImageSlots, removeLevel, resolveLevel, withLevelImage } from '../../src/lib/services/battleMap/levels';
import { toPlayerState } from '../../src/lib/services/battleMap/playerState';
import { asMapTemplate } from '../../src/lib/services/battleMap/mapTemplates';

const tower = () =>
  battleMapSchema.parse({
    name: 'Turm',
    image: 'turm.jpg',
    baseLevelName: 'Hof',
    levels: [
      { id: 'og', name: 'Obergeschoss', elevation: 1, image: 'turm-og.webp', offsetX: 512, fog: { ops: [{ shape: 'rect', mode: 'reveal', x: 0, y: 0, w: 9, h: 9 }] } },
      { id: 'gruft', name: 'Gruft', elevation: -1, image: 'turm-gruft.webp', offsetX: 64 },
    ],
    tokens: [
      { id: 'a', name: 'Ada', kind: 'character', x: 1, y: 1 },
      { id: 'b', name: 'Bo', kind: 'character', x: 2, y: 2, level: 'og' },
      { id: 'z', name: 'Zombie', kind: 'monster', x: 3, y: 3, level: 'gruft' },
    ],
    parkedTokens: [{ id: 'p', name: 'Ghul', kind: 'monster', x: 1, y: 1, level: 'gruft' }],
  });

describe('Kartenebenen', () => {
  it('stapelt die Ebenen von oben nach unten, die Grundebene mittendrin', () => {
    expect(levelStack(tower()).map((l) => l.name)).toEqual(['Obergeschoss', 'Hof', 'Gruft']);
    expect(levelBelow(tower(), 'og')).toBe('');
    expect(levelBelow(tower(), '')).toBe('gruft');
    expect(levelBelow(tower(), 'gruft')).toBeNull();
  });

  it('ändert über die Ebenensicht Nebel und Licht der Karte selbst', () => {
    const map = tower();
    layerOf(map, '').fog.ops.push({ shape: 'rect', mode: 'cover', x: 0, y: 0, w: 1, h: 1 });
    layerOf(map, 'gruft').lighting.darkness = 0.8;
    expect(map.fog.ops).toHaveLength(1);
    expect(map.levels[1].lighting.darkness).toBe(0.8);
    expect(resolveLevel(map, 'weg')).toBe('');
  });

  it('legt neue Ebenen über der höchsten bzw. unter der tiefsten an', () => {
    const map = tower();
    expect(addLevel(map, 1, 'dach')).toMatchObject({ elevation: 2, name: '2. Obergeschoss' });
    expect(addLevel(map, -1, 'tief')).toMatchObject({ elevation: -2, name: '2. Untergeschoss' });
  });

  it('nimmt beim Löschen die Tokens der Ebene mit und holt die Spieler zurück', () => {
    const map = tower();
    map.playerLevel = 'gruft';
    expect(removeLevel(map, 'gruft')).toEqual(['z', 'p']);
    expect(map.tokens.map((t) => t.id)).toEqual(['a', 'b']);
    expect(map.parkedTokens).toEqual([]);
    expect(map.playerLevel).toBe('');
  });

  it('zeigt den Spielern nur ihre Ebene, mit der darunter als Durchblick', () => {
    const map = tower();
    map.playerLevel = 'og';
    const state = toPlayerState(map, { levels: { '': 'hof.jpg', og: 'og.webp' }, tokens: {}, frame: { w: 1536, h: 1024 } });
    expect(state.tokens.map((t) => t.id)).toEqual(['b']);
    expect(state).toMatchObject({ imageUrl: 'og.webp', imageAt: { x: 512, y: 0 }, underlay: { url: 'hof.jpg', x: 0, y: 0 }, levelName: 'Obergeschoss' });
    expect(state.fog.ops).toHaveLength(1);
  });

  it('nennt ohne weitere Ebenen keinen Ebenennamen', () => {
    const state = toPlayerState(battleMapSchema.parse({ name: 'x' }), { levels: {}, tokens: {}, frame: { w: 0, h: 0 } });
    expect(state.levelName).toBe('');
    expect(state.underlay).toBeNull();
  });

  it('kennt alle Bilder der Karte und ersetzt sie je Ebene', () => {
    const map = tower();
    expect(mapImageSlots(map).map((s) => s.level)).toEqual(['', 'og', 'gruft']);
    expect(withLevelImage(map, 'og', 'neu.webp').levels[0].image).toBe('neu.webp');
    expect(withLevelImage(map, '', 'neu.jpg').image).toBe('neu.jpg');
  });

  it('deckt als Vorlage auch den Nebel aller Ebenen wieder zu', () => {
    const map = { ...tower(), playerLevel: 'og' };
    const template = asMapTemplate(map);
    expect(template.levels[0].fog.ops).toEqual([]);
    expect(template.playerLevel).toBe('');
  });
});

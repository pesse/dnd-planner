import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import {
  cellsForCreatureSize,
  distanceCells,
  fitRect,
  gridFromCell,
  pxToCell,
  snapCell,
  visibleRect,
  zoomAt,
} from '../../src/lib/services/battleMap/geometry';
import { clampToView, toPlayerState } from '../../src/lib/services/battleMap/playerState';
import { flickerLights, tokenLights } from '../../src/lib/services/battleMap/overlayRender';
import { markerDraft, numberedNames, occupiedCells, placeDrafts } from '../../src/lib/services/battleMap/tokenSources';

const NO_IMAGES = { levels: {}, tokens: {}, frame: { w: 0, h: 0 } };

const grid = battleMapSchema.parse({ name: 'x' }).grid;

describe('battleMapSchema', () => {
  it('füllt eine neue Karte mit Vorgaben', () => {
    const map = battleMapSchema.parse({ name: 'Gruft' });
    expect(map).toMatchObject({ image: '', tokens: [], fog: { enabled: true, ops: [] }, playerView: null });
    expect(map.grid.metersPerCell).toBe(1.5);
  });
});

describe('Geometrie', () => {
  it('zählt Diagonalen wie Geraden (2024)', () => {
    expect(distanceCells(grid, { x: 0, y: 0 }, { x: 3 * grid.size, y: 2 * grid.size })).toBe(3);
  });

  it('rastet Winzlinge auf halbe Felder, alle anderen auf ganze', () => {
    expect(snapCell(2.3, 0.5)).toBe(2.5);
    expect(snapCell(2.3, 1)).toBe(2);
  });

  it('richtet das Raster an einem aufgezogenen Feld aus', () => {
    const g = gridFromCell({ x: 130, y: 75, w: 50, h: 50 });
    expect(g).toEqual({ size: 50, offsetX: 30, offsetY: 25 });
    expect(pxToCell({ ...grid, ...g }, { x: 130, y: 75 })).toEqual({ x: 2, y: 1 });
  });

  it('übersetzt Kreaturengrößen in Felder', () => {
    expect(cellsForCreatureSize('Large')).toBe(2);
    expect(cellsForCreatureSize('Gargantuan')).toBe(4);
    expect(cellsForCreatureSize(undefined)).toBe(1);
  });

  it('passt einen Ausschnitt eingepasst ins Fenster und findet ihn wieder', () => {
    const rect = { x: 100, y: 50, w: 400, h: 200 };
    const cam = fitRect(rect, 800, 400);
    expect(visibleRect(cam, 800, 400)).toEqual(rect);
  });

  it('zoomt um den Mauspunkt', () => {
    const cam = zoomAt({ zoom: 1, tx: 0, ty: 0 }, { x: 100, y: 100 }, 2);
    expect(cam).toEqual({ zoom: 2, tx: -100, ty: -100 });
  });
});

describe('Spieleransicht', () => {
  it('lässt versteckte Tokens und SL-Felder weg', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [
        { id: 'a', name: 'Goblin', kind: 'monster', ref: 'goblin', art: 'monsters/goblin', x: 1, y: 1, hidden: true },
        { id: 'b', name: 'Ada', kind: 'character', ref: 'abc', x: 2, y: 2 },
        { id: 'c', name: 'Falltür', kind: 'marker', x: 3, y: 3 },
      ],
    });
    const state = toPlayerState(map, { levels: { '': 'map.png' }, tokens: { b: 'ada.png' }, frame: { w: 0, h: 0 } });
    expect(state.tokens[0]).toEqual({ id: 'b', name: 'Ada', x: 2, y: 2, size: 1, color: '#8a2012', conditions: [], effects: [], light: null, imageUrl: 'ada.png', movable: true, down: false, bloodied: false });
    expect(state.tokens[1].movable).toBe(false);
    expect(JSON.stringify(state)).not.toContain('goblin');
  });

  it('schickt leuchtende versteckte Tokens nicht mit — ihr Licht verriete sie', () => {
    const map = battleMapSchema.parse({
      name: 'x',
      tokens: [
        { id: 'a', name: 'Schleicher', x: 1, y: 1, hidden: true, light: { radius: 8 } },
        { id: 'b', name: 'Ada', kind: 'character', x: 2, y: 2, light: { radius: 8 } },
      ],
    });
    expect(toPlayerState(map, NO_IMAGES).tokens.map((t) => t.light?.radius)).toEqual([8]);
  });

  it('hält ein gezogenes Token im Ausschnitt', () => {
    const grid = battleMapSchema.parse({ name: 'x' }).grid;
    const view = { x: 70, y: 70, w: 700, h: 350 };
    expect(clampToView(grid, view, 1, { x: -3, y: 4.5 })).toEqual({ x: 1, y: 4.5 });
    expect(clampToView(grid, view, 2, { x: 20, y: 9 })).toEqual({ x: 9, y: 4 });
  });
});

describe('Token-Entwürfe', () => {
  it('nummeriert mehrere gleiche Monster', () => {
    expect(numberedNames('Goblin', 1)).toEqual(['Goblin']);
    expect(numberedNames('Goblin', 3)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
  });

  it('legt Tokens zeilenweise nebeneinander, große nehmen mehr Platz', () => {
    const big = { ...markerDraft('Oger'), size: 2 };
    const placed = placeDrafts([markerDraft('A'), big, markerDraft('B')], { x: 3.7, y: 1.2 });
    expect(placed.map((t) => [t.x, t.y])).toEqual([[3, 1], [4, 1], [6, 1]]);
    expect(new Set(placed.map((t) => t.id)).size).toBe(3);
  });

  it('bricht nach sechs Feldern in die nächste Zeile um', () => {
    const placed = placeDrafts(Array.from({ length: 7 }, (_, i) => markerDraft(`M${i}`)), { x: 0, y: 0 });
    expect(placed[6]).toMatchObject({ x: 0, y: 1 });
  });

  it('überspringt belegte Felder, auch die eines großen Tokens', () => {
    const taken = occupiedCells([{ x: 0, y: 0, size: 2 }]);
    const placed = placeDrafts([markerDraft('A'), markerDraft('B')], { x: 0, y: 0 }, taken);
    expect(placed.map((t) => [t.x, t.y])).toEqual([[2, 0], [3, 0]]);
  });
});

describe('Token-Licht', () => {
  it('strahlt aus der Tokenmitte, Raster-Versatz eingerechnet', () => {
    const g = { ...grid, size: 50, offsetX: 10, offsetY: 5 };
    expect(tokenLights([{ id: 'a', x: 2, y: 1, size: 2, light: { radius: 8, color: '#fff' } }, { id: 'b', x: 0, y: 0, size: 1, light: null }], g)).toEqual([
      { id: 'a', x: 160, y: 105, radius: 8, color: '#fff' },
    ]);
  });

  it('flackert nur leicht, ungleich und unabhängig vom Ort', () => {
    const lights = [
      { id: 'fackel', x: 100, y: 100, radius: 10, color: '#fff' },
      { id: 'kerze', x: 100, y: 100, radius: 10, color: '#fff' },
    ];
    const radii = Array.from({ length: 400 }, (_, i) => flickerLights(lights, i * 0.05).map((l) => l.radius));
    for (const r of radii.flat()) {
      expect(r).toBeGreaterThanOrEqual(9.6);
      expect(r).toBeLessThanOrEqual(10.4);
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const [as, bs] = [radii.map(([a]) => a), radii.map(([, b]) => b)];
    const [ma, mb] = [mean(as), mean(bs)];
    const cov = mean(as.map((a, i) => (a - ma) * (bs[i] - mb)));
    const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    expect(Math.abs(cov / (sd(as, ma) * sd(bs, mb)))).toBeLessThan(0.5);

    const moved = flickerLights([{ ...lights[0], x: 137, y: 412 }], 3.3)[0].radius;
    expect(moved).toBe(flickerLights([lights[0]], 3.3)[0].radius);
  });
});

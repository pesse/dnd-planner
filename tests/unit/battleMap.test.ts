import { describe, expect, it } from 'vitest';
import { battleMapSchema } from '../../src/lib/schemas/battleMap';
import {
  cellsForCreatureSize,
  distanceCells,
  expandToAspect,
  fitRect,
  gridFromCell,
  pxToCell,
  snapCell,
  visibleRect,
  zoomAt,
} from '../../src/lib/services/battleMap/geometry';
import { toPlayerState } from '../../src/lib/services/battleMap/playerState';
import { markerDraft, numberedNames, occupiedCells, placeDrafts } from '../../src/lib/services/battleMap/tokenSources';

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

  it('erweitert einen Ausschnitt auf das Seitenverhältnis des Spielerfensters', () => {
    expect(expandToAspect({ x: 0, y: 0, w: 100, h: 100 }, 2)).toEqual({ x: -50, y: 0, w: 200, h: 100 });
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
      ],
    });
    const state = toPlayerState(map, 'map.png', { b: 'ada.png' });
    expect(state.tokens).toEqual([{ id: 'b', name: 'Ada', x: 2, y: 2, size: 1, color: '#8a2012', imageUrl: 'ada.png' }]);
    expect(JSON.stringify(state)).not.toContain('goblin');
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

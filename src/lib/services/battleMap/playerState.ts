/** Was das Spielerfenster bekommt. Versteckte Tokens verlassen das SL-Fenster gar nicht erst. */
import type { BattleMap, FogOp, Grid, Lighting, Token, ViewRect } from '../../schemas/battleMap';
import { pxToCell, type Point } from './geometry';
import { isBloodied } from './tokenDetails';
import { layerOf, levelName, placedImages, resolveLevel, type PlacedImage } from './levels';

/**
 * `movable`: Spieler dürfen nur Charaktere ziehen. Notizen und Encounter bleiben bei der SL.
 * Von den TP erfahren die Spieler nur, ob jemand blutig oder besiegt ist, von einer Falle nur, dass sie entschärft ist.
 */
export type PlayerToken = Omit<Token, 'hidden' | 'ref' | 'art' | 'note' | 'encounter' | 'hp' | 'hpMax' | 'initiative' | 'trapState' | 'trapTier' | 'level'> & {
  imageUrl: string;
  movable: boolean;
  down: boolean;
  bloodied: boolean;
};

export interface PlayerState {
  image: PlacedImage;
  /** Die Ebene darunter, durch transparente Stellen sichtbar. */
  underlay: PlacedImage | null;
  /** Format der Grundebene — Rahmen für Nebel, Licht und Ausschnitt. */
  frame: { w: number; h: number };
  /** Leer, solange die Karte nur eine Ebene hat. */
  levelName: string;
  grid: Grid;
  tokens: PlayerToken[];
  fog: { enabled: boolean; ops: FogOp[] };
  lighting: Lighting;
  view: ViewRect | null;
  /** Leer, solange ein verstecktes Token am Zug ist — sonst verriete der Zug es. */
  turn: string;
}

export interface PlayerImages {
  levels: Record<string, string>;
  tokens: Record<string, string>;
  frame: { w: number; h: number };
}

/** Die eine Regel, was die Spieler von einem Token mitbekommen — Anzeige, TP-Zahl, Ziehen und Zustände. */
export const seenByPlayers = (map: BattleMap, t: Pick<Token, 'hidden' | 'level'>): boolean =>
  !t.hidden && t.level === resolveLevel(map, map.playerLevel);

export function toPlayerState(map: BattleMap, images: PlayerImages): PlayerState {
  const level = resolveLevel(map, map.playerLevel);
  const layer = layerOf(map, level);
  const onLevel = map.tokens.filter((t) => seenByPlayers(map, t));
  return {
    ...placedImages(map, level, images.levels),
    frame: images.frame,
    levelName: map.levels.length ? levelName(map, level) : '',
    grid: map.grid,
    tokens: onLevel
      .map(({ id, name, x, y, size, color, kind, conditions, effects, light, hp, hpMax, trapState }) => ({
        id,
        name,
        x,
        y,
        size,
        kind,
        color,
        conditions,
        effects,
        light,
        imageUrl: images.tokens[id] ?? '',
        movable: kind === 'character',
        down: hp === 0 || (kind === 'trap' && trapState === 'disarmed'),
        bloodied: isBloodied({ hp, hpMax }),
      })),
    fog: layer.fog,
    lighting: layer.lighting,
    view: map.playerView,
    turn: onLevel.some((t) => t.id === map.combat.turn) ? map.combat.turn : '',
  };
}

/** Hält ein Token (Feldkoordinaten) innerhalb des Ausschnitts — dahinter könnten die Spieler es nicht mehr greifen. */
export function clampToView(grid: Grid, view: ViewRect, size: number, cell: Point): Point {
  const a = pxToCell(grid, view);
  const b = pxToCell(grid, { x: view.x + view.w, y: view.y + view.h });
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return { x: clamp(cell.x, a.x, b.x - size), y: clamp(cell.y, a.y, b.y - size) };
}

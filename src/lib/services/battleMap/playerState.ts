/** Was das Spielerfenster bekommt. Versteckte Tokens verlassen das SL-Fenster gar nicht erst. */
import type { BattleMap, FogOp, Grid, Lighting, Token, ViewRect } from '../../schemas/battleMap';
import { pxToCell, type Point } from './geometry';
import { isBloodied } from './tokenDetails';

/**
 * `movable`: Spieler dürfen nur Charaktere ziehen. Notizen und Encounter bleiben bei der SL.
 * Von den TP erfahren die Spieler nur, ob jemand blutig oder besiegt ist, von einer Falle nur, dass sie entschärft ist.
 */
export type PlayerToken = Omit<Token, 'hidden' | 'ref' | 'kind' | 'art' | 'note' | 'encounter' | 'hp' | 'hpMax' | 'initiative' | 'trapState' | 'trapTier'> & {
  imageUrl: string;
  movable: boolean;
  down: boolean;
  bloodied: boolean;
};

export interface PlayerState {
  imageUrl: string;
  grid: Grid;
  tokens: PlayerToken[];
  fog: { enabled: boolean; ops: FogOp[] };
  lighting: Lighting;
  view: ViewRect | null;
  /** Leer, solange ein verstecktes Token am Zug ist — sonst verriete der Zug es. */
  turn: string;
}

export function toPlayerState(map: BattleMap, imageUrl: string, tokenImages: Record<string, string>): PlayerState {
  return {
    imageUrl,
    grid: map.grid,
    tokens: map.tokens
      .filter((t) => !t.hidden)
      .map(({ id, name, x, y, size, color, kind, conditions, effects, light, hp, hpMax, trapState }) => ({
        id,
        name,
        x,
        y,
        size,
        color,
        conditions,
        effects,
        light,
        imageUrl: tokenImages[id] ?? '',
        movable: kind === 'character',
        down: hp === 0 || (kind === 'trap' && trapState === 'disarmed'),
        bloodied: isBloodied({ hp, hpMax }),
      })),
    fog: map.fog,
    lighting: map.lighting,
    view: map.playerView,
    turn: map.tokens.some((t) => t.id === map.combat.turn && !t.hidden) ? map.combat.turn : '',
  };
}

/** Hält ein Token (Feldkoordinaten) innerhalb des Ausschnitts — dahinter könnten die Spieler es nicht mehr greifen. */
export function clampToView(grid: Grid, view: ViewRect, size: number, cell: Point): Point {
  const a = pxToCell(grid, view);
  const b = pxToCell(grid, { x: view.x + view.w, y: view.y + view.h });
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return { x: clamp(cell.x, a.x, b.x - size), y: clamp(cell.y, a.y, b.y - size) };
}

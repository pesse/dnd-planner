/** Was das Spielerfenster bekommt. Versteckte Tokens verlassen das SL-Fenster gar nicht erst. */
import type { BattleMap, FogOp, Grid, Lighting, Token, ViewRect } from '../../schemas/battleMap';

export type PlayerToken = Omit<Token, 'hidden' | 'ref' | 'kind' | 'art'> & { imageUrl: string };

export interface PlayerState {
  imageUrl: string;
  grid: Grid;
  tokens: PlayerToken[];
  fog: { enabled: boolean; ops: FogOp[] };
  lighting: Lighting;
  view: ViewRect | null;
}

export function toPlayerState(map: BattleMap, imageUrl: string, tokenImages: Record<string, string>): PlayerState {
  return {
    imageUrl,
    grid: map.grid,
    tokens: map.tokens
      .filter((t) => !t.hidden)
      .map(({ id, name, x, y, size, color }) => ({ id, name, x, y, size, color, imageUrl: tokenImages[id] ?? '' })),
    fog: map.fog,
    lighting: map.lighting,
    view: map.playerView,
  };
}

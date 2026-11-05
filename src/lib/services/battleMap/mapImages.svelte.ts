/** Bild-URLs einer Karte: je Ebene, je Token, und das Format der Grundebene als Rahmen aller Ebenen. */
import type { BattleMap, Token } from '../../schemas/battleMap';
import { BASE_LEVEL, layerOf } from './levels';
import { mapImageUrl, measureImage } from './mapFiles';
import type { PlayerImages } from './playerState';
import { resolveTokenImage } from './tokenSources';

export class MapImages {
  levels = $state<Record<string, string>>({});
  tokens = $state<Record<string, string>>({});
  frame = $state({ w: 0, h: 0 });

  reset(): void {
    this.levels = {};
    this.tokens = {};
  }

  async refreshAll(mapPath: string, map: BattleMap): Promise<void> {
    const levels = [BASE_LEVEL, ...map.levels.map((l) => l.id)];
    await Promise.all([...levels.map((l) => this.refreshLevel(mapPath, map, l)), ...map.tokens.map((t) => this.resolveToken(t))]);
  }

  async refreshLevel(mapPath: string, map: BattleMap, level: string): Promise<void> {
    const url = await mapImageUrl(mapPath, layerOf(map, level).image);
    this.levels[level] = url;
    if (level === BASE_LEVEL) this.frame = await measureImage(url);
  }

  /** Schon aufgelöste Tokens bleiben, wie sie sind; `forgetToken` erzwingt ein neues Bild. */
  async resolveToken(t: Token): Promise<void> {
    if (this.tokens[t.id] !== undefined) return;
    this.tokens[t.id] = await resolveTokenImage(t);
  }

  forgetToken(id: string): void {
    delete this.tokens[id];
  }

  snapshot(): PlayerImages {
    return { levels: $state.snapshot(this.levels), tokens: $state.snapshot(this.tokens), frame: $state.snapshot(this.frame) };
  }
}

/**
 * Zustand der SL-Ansicht einer Karte. Jede Änderung speichert verzögert und geht im nächsten
 * Frame an das Spielerfenster; `checkpoint()` vor einer Änderung macht sie rückgängig-fähig.
 */
import type { BattleMap, FogOp, Light, Token, ViewRect } from '../../schemas/battleMap';
import { AutosaveFile } from '../../utils/autosaveFile.svelte';
import { newUid } from '../../utils/uid';
import { onPlayerMessage, sendToPlayer } from './channel';
import { gridFromCell, type Point } from './geometry';
import { loadBattleMap, mapImageUrl, pickMapImage, serializeBattleMap } from './mapFiles';
import { toPlayerState } from './playerState';
import { occupiedCells, placeDrafts, resolveTokenImage, type TokenDraft } from './tokenSources';

export type MapTool = 'select' | 'view' | 'reveal-rect' | 'reveal-brush' | 'cover-rect' | 'cover-brush' | 'light' | 'ruler' | 'grid';

const UNDO_LIMIT = 50;

export class MapEditor {
  path = $state('');
  map = $state<BattleMap | null>(null);
  imageUrl = $state('');
  imageSize = $state({ w: 0, h: 0 });
  tokenImages = $state<Record<string, string>>({});
  selectedId = $state<string | null>(null);
  tool = $state<MapTool>('select');
  brushRadius = $state(40);
  error = $state('');
  /** Seitenverhältnis des Spielerfensters, sobald es sich gemeldet hat. */
  playerAspect = $state<number | null>(null);

  readonly saver = new AutosaveFile(800);
  #undo: string[] = [];
  #redo: string[] = [];
  #frame = 0;
  #unlisten: (() => void) | null = null;

  constructor() {
    this.#unlisten = onPlayerMessage((msg) => {
      if (msg.type === 'hello') this.#broadcastNow();
      else if (msg.type === 'viewport') this.playerAspect = msg.h > 0 ? msg.w / msg.h : null;
      else if (msg.type === 'bye') this.playerAspect = null;
    });
  }

  get selected(): Token | null {
    return this.map?.tokens.find((t) => t.id === this.selectedId) ?? null;
  }

  async load(path: string): Promise<void> {
    await this.saver.flush();
    this.path = path;
    this.error = '';
    this.#undo = [];
    this.#redo = [];
    try {
      const map = await loadBattleMap(path);
      if (this.path !== path) return;
      this.map = map;
      this.saver.markSaved();
      await this.#refreshImages();
      this.#broadcastNow();
    } catch (e) {
      this.map = null;
      this.error = `Karte konnte nicht geladen werden: ${e}`;
    }
  }

  async destroy(): Promise<void> {
    this.#unlisten?.();
    cancelAnimationFrame(this.#frame);
    await this.saver.flush();
  }

  async chooseImage(): Promise<void> {
    if (!this.map) return;
    try {
      const file = await pickMapImage(this.path);
      if (!file) return;
      this.checkpoint();
      this.map.image = file;
      this.imageUrl = await mapImageUrl(this.path, this.map);
      this.changed();
    } catch (e) {
      this.error = `Bild konnte nicht übernommen werden: ${e}`;
    }
  }

  checkpoint(): void {
    if (!this.map) return;
    this.#undo.push(serializeBattleMap($state.snapshot(this.map) as BattleMap));
    if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
    this.#redo = [];
  }

  undo(): void {
    this.#step(this.#undo, this.#redo);
  }

  redo(): void {
    this.#step(this.#redo, this.#undo);
  }

  #step(from: string[], to: string[]): void {
    const prev = from.pop();
    if (!prev || !this.map) return;
    to.push(serializeBattleMap($state.snapshot(this.map) as BattleMap));
    this.map = JSON.parse(prev) as BattleMap;
    if (this.selectedId && !this.map.tokens.some((t) => t.id === this.selectedId)) this.selectedId = null;
    void this.#refreshImages();
    this.changed();
  }

  /** Nach jeder Änderung an `map`. */
  changed(): void {
    if (!this.map) return;
    this.saver.schedule(this.path, serializeBattleMap($state.snapshot(this.map) as BattleMap));
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#broadcastNow());
  }

  #broadcastNow(): void {
    if (!this.map) return;
    const map = $state.snapshot(this.map) as BattleMap;
    sendToPlayer({ type: 'state', state: toPlayerState(map, this.imageUrl, $state.snapshot(this.tokenImages)) });
  }

  async #refreshImages(): Promise<void> {
    if (!this.map) return;
    this.imageUrl = await mapImageUrl(this.path, this.map);
    await Promise.all(this.map.tokens.map((t) => this.#resolveToken(t)));
  }

  async #resolveToken(t: Token): Promise<void> {
    if (this.tokenImages[t.id] !== undefined) return;
    this.tokenImages[t.id] = await resolveTokenImage(t);
  }

  addTokens(drafts: TokenDraft[], originCell: Point): void {
    if (!this.map || !drafts.length) return;
    this.checkpoint();
    const tokens = placeDrafts(drafts, originCell, occupiedCells(this.map.tokens));
    this.map.tokens.push(...tokens);
    this.selectedId = tokens.length === 1 ? tokens[0].id : this.selectedId;
    this.changed();
    void Promise.all(tokens.map((t) => this.#resolveToken(t))).then(() => this.changed());
  }

  updateToken(id: string, patch: Partial<Token>): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.changed();
  }

  removeToken(id: string): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.tokens = this.map.tokens.filter((t) => t.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.changed();
  }

  setAllHidden(kind: Token['kind'], hidden: boolean): void {
    if (!this.map) return;
    this.checkpoint();
    for (const t of this.map.tokens) if (t.kind === kind) t.hidden = hidden;
    this.changed();
  }

  addFogOp(op: FogOp): void {
    if (!this.map) return;
    this.map.fog.ops.push(op);
    this.changed();
  }

  /** Alte Operationen fallen weg — ein „alles" überdeckt sie ohnehin. */
  setFogAll(revealed: boolean): void {
    if (!this.map) return;
    this.checkpoint();
    const { w, h } = this.imageSize;
    this.map.fog.ops = revealed ? [{ shape: 'rect', mode: 'reveal', x: 0, y: 0, w: Math.max(w, 1), h: Math.max(h, 1) }] : [];
    this.changed();
  }

  addLight(at: Point): Light | null {
    if (!this.map) return null;
    this.checkpoint();
    const light: Light = { id: newUid(), x: at.x, y: at.y, radius: 4, color: '#ffb347' };
    this.map.lighting.lights.push(light);
    if (this.map.lighting.darkness === 0) this.map.lighting.darkness = 0.75;
    this.changed();
    return light;
  }

  removeLight(id: string): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.lighting.lights = this.map.lighting.lights.filter((l) => l.id !== id);
    this.changed();
  }

  calibrateGrid(rect: ViewRect): void {
    if (!this.map || rect.w < 4 || rect.h < 4) return;
    this.checkpoint();
    Object.assign(this.map.grid, gridFromCell(rect));
    this.changed();
  }

  setPlayerView(rect: ViewRect | null): void {
    if (!this.map) return;
    this.map.playerView = rect;
    this.changed();
  }
}

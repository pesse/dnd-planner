/**
 * Zustand der SL-Ansicht einer Karte. Jede Änderung speichert verzögert und geht im nächsten
 * Frame an das Spielerfenster; `checkpoint()` vor einer Änderung macht sie rückgängig-fähig.
 */
import { popHp } from './hpPops.svelte';
import { TOKEN_EFFECT_KEYS, type BattleMap, type FogOp, type Light, type Token, type TokenLight, type TokenEffect, type ViewRect } from '../../schemas/battleMap';
import { CONDITION_KEYS, type Condition } from '../../schemas/vocabulary';
import { AutosaveFile } from '../../utils/autosaveFile.svelte';
import { newUid } from '../../utils/uid';
import { onPlayerMessage, sendToPlayer, type ToGm } from './channel';
import { DetailHistory } from './detailHistory.svelte';
import { cockpit } from './cockpitTab.svelte';
import { gridFromCell, snapCell, type Point } from './geometry';
import { advanceTurn, startCombat } from './initiative';
import { addLevel, BASE_LEVEL, layerOf, levelBelow, levelStack, removeLevel, resolveLevel, tokensOn, withLevelImage, type LevelLayer } from './levels';
import { loadBattleMap, mapImageUrl, measureImage, pickMapImage, serializeBattleMap } from './mapFiles';
import { toPlayerState } from './playerState';
import { loadPlayerTips } from './playerTips';
import { occupiedCells, placeDrafts, resolveTokenImage, type TokenDraft } from './tokenSources';

const isTokenEffect = (b: string): b is TokenEffect => (TOKEN_EFFECT_KEYS as readonly string[]).includes(b);
const isCondition = (b: string): b is Condition => (CONDITION_KEYS as readonly string[]).includes(b);
const toggled = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export type MapTool = 'select' | 'view' | 'reveal-rect' | 'reveal-brush' | 'cover-rect' | 'cover-brush' | 'light' | 'ruler' | 'grid';

const UNDO_LIMIT = 50;

export class MapEditor {
  path = $state('');
  map = $state<BattleMap | null>(null);
  /** Die Ebene, die die SL gerade sieht; die Spieler sehen `map.playerLevel`. */
  level = $state(BASE_LEVEL);
  /** Bild-URL je Ebene. */
  levelImages = $state<Record<string, string>>({});
  /** Format des Grundebenen-Bilds — der Rahmen aller Ebenen. */
  imageSize = $state({ w: 0, h: 0 });
  tokenImages = $state<Record<string, string>>({});
  readonly details = new DetailHistory();
  tool = $state<MapTool>('select');
  brushRadius = $state(40);
  error = $state('');

  readonly saver = new AutosaveFile(800);
  #undo: string[] = [];
  #redo: string[] = [];
  #frame = 0;
  #unlisten: (() => void) | null = null;
  #playerDrag: string | null = null;
  #tips: Record<string, string> = {};

  constructor() {
    void loadPlayerTips().then((tips) => {
      this.#tips = tips;
      sendToPlayer({ type: 'tips', tips });
    });
    this.#unlisten = onPlayerMessage((msg) => {
      if (msg.type === 'hello') {
        sendToPlayer({ type: 'tips', tips: this.#tips });
        this.#broadcastNow();
      }
      else if (msg.type === 'move') this.#playerMove(msg);
      else if (msg.type === 'badge') this.#playerBadge(msg);
    });
  }

  #focusId = $state<string | null>(null);

  get selectedId(): string | null {
    const d = this.details.current;
    if (d.kind === 'token') return d.id;
    return d.kind === 'encounter' && this.#ownToken(this.#focusId, d.key) ? this.#focusId : null;
  }

  /** In der Vorbereitung bleibt ein offener Encounter stehen, solange seine eigenen Tokens gewählt werden — die SL stellt sie gerade auf. */
  set selectedId(id: string | null) {
    const level = this.map?.tokens.find((t) => t.id === id)?.level;
    if (level !== undefined) this.level = level;
    const d = this.details.current;
    if (cockpit.tab === 'prep' && d.kind === 'encounter' && (!id || this.#ownToken(id, d.key))) {
      this.#focusId = id;
      return;
    }
    this.details.show(id ? { kind: 'token', id } : { kind: 'overview' });
  }

  #ownToken(id: string | null, encounter: string): boolean {
    return !!id && !!this.map?.tokens.some((t) => t.id === id && t.encounter === encounter);
  }

  get layer(): LevelLayer {
    return layerOf(this.map!, this.level);
  }

  get imageUrl(): string {
    return this.levelImages[this.level] ?? '';
  }

  /** Scheint durch transparente Stellen der aktuellen Ebene. */
  get underlay(): { url: string; layer: LevelLayer } | null {
    const below = this.map ? levelBelow(this.map, this.level) : null;
    if (below === null || !this.levelImages[below]) return null;
    return { url: this.levelImages[below], layer: layerOf(this.map!, below) };
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
    this.details.reset();
    this.level = BASE_LEVEL;
    this.levelImages = {};
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
      const level = this.level;
      const file = await pickMapImage(this.path, level);
      if (!file) return;
      this.checkpoint();
      this.map = withLevelImage(this.map, level, file);
      await this.#refreshLevelImage(level);
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
    this.level = resolveLevel(this.map, this.level);
    for (const id of this.details.tokenIds()) if (!this.map.tokens.some((t) => t.id === id)) this.details.forget(id);
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

  // Dieselben Regeln wie beim Senden: nur sichtbare Charaktere — das Fenster könnte veraltet sein.
  #playerMove(msg: Extract<ToGm, { type: 'move' }>): void {
    const t = this.map?.tokens.find((x) => x.id === msg.id);
    if (!t || t.kind !== 'character' || t.hidden || t.level !== this.map?.playerLevel) return;
    if (this.#playerDrag !== t.id) this.checkpoint();
    this.#playerDrag = msg.done ? null : t.id;
    const x = msg.done ? snapCell(msg.x, t.size) : msg.x;
    const y = msg.done ? snapCell(msg.y, t.size) : msg.y;
    this.updateToken(t.id, { x, y });
  }

  #playerBadge(msg: Extract<ToGm, { type: 'badge' }>): void {
    const t = this.map?.tokens.find((x) => x.id === msg.id);
    if (!t || t.kind !== 'character' || t.hidden || t.level !== this.map?.playerLevel) return;
    if (isTokenEffect(msg.badge)) this.toggleEffect(t.id, msg.badge);
    else if (isCondition(msg.badge)) this.toggleCondition(t.id, msg.badge);
  }

  #broadcastNow(): void {
    if (!this.map) return;
    const map = $state.snapshot(this.map) as BattleMap;
    const images = { levels: $state.snapshot(this.levelImages), tokens: $state.snapshot(this.tokenImages), frame: $state.snapshot(this.imageSize) };
    sendToPlayer({ type: 'state', state: toPlayerState(map, images) });
  }

  async #refreshImages(): Promise<void> {
    if (!this.map) return;
    const levels = [BASE_LEVEL, ...this.map.levels.map((l) => l.id)];
    await Promise.all([...levels.map((l) => this.#refreshLevelImage(l)), ...this.map.tokens.map((t) => this.#resolveToken(t))]);
  }

  async #refreshLevelImage(level: string): Promise<void> {
    if (!this.map) return;
    const url = await mapImageUrl(this.path, layerOf(this.map, level).image);
    this.levelImages[level] = url;
    if (level === BASE_LEVEL) this.imageSize = await measureImage(url);
  }

  async #resolveToken(t: Token): Promise<void> {
    if (this.tokenImages[t.id] !== undefined) return;
    this.tokenImages[t.id] = await resolveTokenImage(t);
  }

  addTokens(drafts: TokenDraft[], originCell: Point): void {
    if (!this.map || !drafts.length) return;
    this.checkpoint();
    const tokens = placeDrafts(drafts, originCell, occupiedCells(tokensOn(this.map.tokens, this.level)), this.level);
    this.map.tokens.push(...tokens);
    if (tokens.length === 1) this.selectedId = tokens[0].id;
    this.changed();
    void Promise.all(tokens.map((t) => this.#resolveToken(t))).then(() => this.changed());
  }

  updateToken(id: string, patch: Partial<Token>): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    this.changed();
    if (t.kind === 'trap' && patch.trapState) {
      delete this.tokenImages[t.id];
      void this.#resolveToken(t).then(() => this.changed());
    }
  }

  /** Schaden oder Heilung: rückgängig-fähig und mit aufsteigender Zahl am Token. */
  setHp(id: string, next: Pick<Token, 'hp' | 'hpMax'>): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t || next.hp == null) return;
    const before = t.hp ?? next.hpMax ?? next.hp;
    this.checkpoint();
    Object.assign(t, next);
    this.showHp(id, next.hp - before);
    this.changed();
  }

  /** Nur die aufsteigende Zahl, in beiden Fenstern — für Charaktere, deren TP die Spieler führen. */
  showHp(id: string, delta: number): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t || !delta) return;
    popHp(id, delta);
    if (!t.hidden) sendToPlayer({ type: 'hp', id, delta });
  }

  removeToken(id: string): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.tokens = this.map.tokens.filter((t) => t.id !== id);
    this.details.forget(id);
    this.changed();
  }

  setAllHidden(kind: Token['kind'], hidden: boolean): void {
    if (!this.map) return;
    this.checkpoint();
    for (const t of this.map.tokens) if (t.kind === kind) t.hidden = hidden;
    this.changed();
  }

  toggleCondition(id: string, condition: Condition): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t) return;
    this.checkpoint();
    t.conditions = toggled(t.conditions, condition);
    this.changed();
  }

  toggleEffect(id: string, effect: TokenEffect): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t) return;
    this.checkpoint();
    t.effects = toggled(t.effects, effect);
    this.changed();
  }

  setTokenLight(id: string, light: TokenLight | null): void {
    const t = this.map?.tokens.find((x) => x.id === id);
    if (!t || !this.map) return;
    t.light = light;
    const { lighting } = layerOf(this.map, t.level);
    if (light && lighting.darkness === 0) lighting.darkness = 0.75;
    this.changed();
  }

  setInitiatives(values: Record<string, number | null>): void {
    if (!this.map) return;
    this.checkpoint();
    for (const t of this.map.tokens) if (t.id in values) t.initiative = values[t.id];
    this.changed();
  }

  startCombat(): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.combat = startCombat(this.map.tokens);
    this.#showTurn();
    this.changed();
  }

  nextTurn(step: 1 | -1): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.combat = advanceTurn(this.map.tokens, this.map.combat, step);
    this.#showTurn();
    this.changed();
  }

  #showTurn(): void {
    if (this.map?.combat.turn) this.selectedId = this.map.combat.turn;
  }

  /** Mit dem Kampf enden auch die Initiativen — der nächste Kampf würfelt neu. */
  endCombat(): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.combat = { round: 0, turn: '' };
    for (const t of this.map.tokens) t.initiative = null;
    this.changed();
  }

  toggleHidden(id: string): void {
    const t = this.map?.tokens.find((o) => o.id === id);
    if (!t) return;
    this.checkpoint();
    this.updateToken(id, { hidden: !t.hidden });
  }

  setEncounterHidden(encounter: string, hidden: boolean): void {
    if (!this.map) return;
    this.checkpoint();
    for (const t of this.map.tokens) if (t.encounter === encounter) t.hidden = hidden;
    this.changed();
  }

  /** Ein ausgeblendeter Encounter nimmt seine Tokens mit von der Karte; Einblenden stellt sie zurück. */
  setEncounterOffered(encounter: string, offered: boolean): void {
    const map = this.map;
    if (!map) return;
    this.checkpoint();
    const [from, to] = offered ? [map.parkedTokens, map.tokens] : [map.tokens, map.parkedTokens];
    const moving = from.filter((t) => t.encounter === encounter);
    if (offered) map.parkedTokens = from.filter((t) => t.encounter !== encounter);
    else map.tokens = from.filter((t) => t.encounter !== encounter);
    to.push(...moving);
    for (const t of moving) if (!offered) this.details.forget(t.id);
    map.hiddenEncounters = offered ? map.hiddenEncounters.filter((k) => k !== encounter) : [...map.hiddenEncounters, encounter];
    this.changed();
    if (offered) void Promise.all(moving.map((t) => this.#resolveToken(t))).then(() => this.changed());
  }

  addFogOp(op: FogOp): void {
    if (!this.map) return;
    this.layer.fog.ops.push(op);
    this.changed();
  }

  /** Alte Operationen fallen weg — ein „alles" überdeckt sie ohnehin. */
  setFogAll(revealed: boolean): void {
    if (!this.map) return;
    this.checkpoint();
    const { w, h } = this.imageSize;
    this.layer.fog.ops = revealed ? [{ shape: 'rect', mode: 'reveal', x: 0, y: 0, w: Math.max(w, 1), h: Math.max(h, 1) }] : [];
    this.changed();
  }

  addLight(at: Point): Light | null {
    if (!this.map) return null;
    this.checkpoint();
    const light: Light = { id: newUid(), x: at.x, y: at.y, radius: 4, color: '#ffb347' };
    const { lighting } = this.layer;
    lighting.lights.push(light);
    if (lighting.darkness === 0) lighting.darkness = 0.75;
    this.changed();
    return light;
  }

  removeLight(id: string): void {
    if (!this.map) return;
    this.checkpoint();
    this.layer.lighting.lights = this.layer.lighting.lights.filter((l) => l.id !== id);
    this.changed();
  }

  addLevel(direction: 1 | -1): void {
    if (!this.map) return;
    this.checkpoint();
    this.level = addLevel(this.map, direction, newUid()).id;
    this.changed();
  }

  removeLevel(id: string): void {
    if (!this.map || id === BASE_LEVEL) return;
    this.checkpoint();
    for (const t of removeLevel(this.map, id)) this.details.forget(t);
    this.level = resolveLevel(this.map, this.level);
    this.changed();
  }

  /** Bild auf/ab: eine Ebene höher bzw. tiefer, am Ende bleibt sie stehen. */
  stepLevel(direction: 1 | -1): void {
    if (!this.map) return;
    const stack = levelStack(this.map);
    const i = stack.findIndex((l) => l.id === this.level) - direction;
    if (stack[i]) this.level = stack[i].id;
  }

  showLevelToPlayers(id: string): void {
    if (!this.map) return;
    this.checkpoint();
    this.map.playerLevel = resolveLevel(this.map, id);
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

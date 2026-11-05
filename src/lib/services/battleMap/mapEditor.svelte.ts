/**
 * Zustand der SL-Ansicht einer Karte. Jede Änderung speichert verzögert und geht im nächsten
 * Frame an das Spielerfenster; `checkpoint()` vor einer Änderung macht sie rückgängig-fähig.
 */
import { popHp } from './hpPops.svelte';
import { TOKEN_EFFECT_KEYS, type BattleMap, type FogOp, type Light, type Token, type TokenLight, type TokenEffect, type ViewRect } from '../../schemas/battleMap';
import { CONDITION_KEYS, type Condition } from '../../schemas/vocabulary';
import type { Badge } from '../../conditionIcon';
import { AutosaveFile } from '../../utils/autosaveFile.svelte';
import { newUid } from '../../utils/uid';
import { DetailHistory } from './detailHistory.svelte';
import { cockpit } from './cockpitTab.svelte';
import { gridFromCell, type Point } from './geometry';
import { advanceTurn, startCombat } from './initiative';
import { addLevel, BASE_LEVEL, layerOf, levelStack, placedImages, removeLevel, resolveLevel, tokensOn, withLevelImage, type LevelLayer, type PlacedImage } from './levels';
import { loadBattleMap, pickMapImage, serializeBattleMap } from './mapFiles';
import { MapImages } from './mapImages.svelte';
import { PlayerLink } from './playerLink';
import { occupiedCells, placeDrafts, type TokenDraft } from './tokenSources';

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
  readonly images = new MapImages();
  readonly details = new DetailHistory();
  tool = $state<MapTool>('select');
  brushRadius = $state(40);
  error = $state('');

  readonly saver = new AutosaveFile(800);
  #undo: string[] = [];
  #redo: string[] = [];
  readonly #players = new PlayerLink({
    map: () => (this.map ? ($state.snapshot(this.map) as BattleMap) : null),
    images: () => this.images.snapshot(),
    moveToken: (id, at, first) => {
      if (first) this.checkpoint();
      this.updateToken(id, at);
    },
    toggleBadge: (id: string, badge: Badge) => {
      if (isTokenEffect(badge)) this.toggleEffect(id, badge);
      else if (isCondition(badge)) this.toggleCondition(id, badge);
    },
  });

  #focusId = $state<string | null>(null);

  get selectedId(): string | null {
    const d = this.details.current;
    if (d.kind === 'token') return d.id;
    return d.kind === 'encounter' && this.#ownToken(this.#focusId, d.key) ? this.#focusId : null;
  }

  /** In der Vorbereitung bleibt ein offener Encounter stehen, solange seine eigenen Tokens gewählt werden — die SL stellt sie gerade auf. */
  set selectedId(id: string | null) {
    const level = this.#token(id)?.level;
    if (level !== undefined) this.level = level;
    const d = this.details.current;
    if (cockpit.tab === 'prep' && d.kind === 'encounter' && (!id || this.#ownToken(id, d.key))) {
      this.#focusId = id;
      return;
    }
    this.details.show(id ? { kind: 'token', id } : { kind: 'overview' });
  }

  #ownToken(id: string | null, encounter: string): boolean {
    return this.#token(id)?.encounter === encounter;
  }

  #token(id: string | null): Token | undefined {
    return id ? this.map?.tokens.find((t) => t.id === id) : undefined;
  }

  get layer(): LevelLayer {
    return layerOf(this.map!, this.level);
  }

  /** Bild der aktuellen Ebene und darunter die Ebene, die durch seine transparenten Stellen scheint. */
  get placed(): { image: PlacedImage; underlay: PlacedImage | null } {
    return placedImages(this.map!, this.level, this.images.levels);
  }

  get selected(): Token | null {
    return this.#token(this.selectedId) ?? null;
  }

  async load(path: string): Promise<void> {
    await this.saver.flush();
    this.path = path;
    this.error = '';
    this.#undo = [];
    this.#redo = [];
    this.details.reset();
    this.level = BASE_LEVEL;
    this.images.reset();
    try {
      const map = await loadBattleMap(path);
      if (this.path !== path) return;
      this.map = map;
      this.saver.markSaved();
      await this.images.refreshAll(path, map);
      this.#players.sendNow();
    } catch (e) {
      this.map = null;
      this.error = `Karte konnte nicht geladen werden: ${e}`;
    }
  }

  async destroy(): Promise<void> {
    this.#players.destroy();
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
      await this.images.refreshLevel(this.path, this.map, level);
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
    for (const id of this.details.tokenIds()) if (!this.#token(id)) this.details.forget(id);
    void this.images.refreshAll(this.path, this.map);
    this.changed();
  }

  /** Nach jeder Änderung an `map`. */
  changed(): void {
    if (!this.map) return;
    this.saver.schedule(this.path, serializeBattleMap($state.snapshot(this.map) as BattleMap));
    this.#players.schedule();
  }

  /** Rückgängig-fähige Änderung an der ganzen Karte. */
  #edit(fn: (map: BattleMap) => void): void {
    if (!this.map) return;
    this.checkpoint();
    fn(this.map);
    this.changed();
  }

  #editToken(id: string, fn: (t: Token) => void, undoable = true): Token | undefined {
    const t = this.#token(id);
    if (!t) return;
    if (undoable) this.checkpoint();
    fn(t);
    this.changed();
    return t;
  }

  #refreshTokenImages(tokens: Token[]): void {
    void Promise.all(tokens.map((t) => this.images.resolveToken(t))).then(() => this.changed());
  }

  addTokens(drafts: TokenDraft[], originCell: Point): void {
    if (!this.map || !drafts.length) return;
    const tokens = placeDrafts(drafts, originCell, occupiedCells(tokensOn(this.map.tokens, this.level)), this.level);
    this.#edit((map) => map.tokens.push(...tokens));
    if (tokens.length === 1) this.selectedId = tokens[0].id;
    this.#refreshTokenImages(tokens);
  }

  /** Ohne eigenen Rückgängig-Punkt: Ziehen und Tippen setzen ihn selbst, einmal pro Geste. */
  updateToken(id: string, patch: Partial<Token>): void {
    const t = this.#editToken(id, (x) => Object.assign(x, patch), false);
    if (t?.kind !== 'trap' || !patch.trapState) return;
    this.images.forgetToken(t.id);
    this.#refreshTokenImages([t]);
  }

  /** Schaden oder Heilung: rückgängig-fähig und mit aufsteigender Zahl am Token. */
  setHp(id: string, next: Pick<Token, 'hp' | 'hpMax'>): void {
    const t = this.#token(id);
    if (!t || next.hp == null) return;
    const before = t.hp ?? next.hpMax ?? next.hp;
    this.#editToken(id, (x) => Object.assign(x, next));
    this.showHp(id, next.hp - before);
  }

  /** Nur die aufsteigende Zahl, in beiden Fenstern — für Charaktere, deren TP die Spieler führen. */
  showHp(id: string, delta: number): void {
    const t = this.#token(id);
    if (!t || !this.map || !delta) return;
    popHp(id, delta);
    this.#players.showHp(this.map, t, delta);
  }

  removeToken(id: string): void {
    this.#edit((map) => (map.tokens = map.tokens.filter((t) => t.id !== id)));
    this.details.forget(id);
  }

  setAllHidden(kind: Token['kind'], hidden: boolean): void {
    this.#edit((map) => {
      for (const t of map.tokens) if (t.kind === kind) t.hidden = hidden;
    });
  }

  toggleHidden(id: string): void {
    this.#editToken(id, (t) => (t.hidden = !t.hidden));
  }

  toggleCondition(id: string, condition: Condition): void {
    this.#editToken(id, (t) => (t.conditions = toggled(t.conditions, condition)));
  }

  toggleEffect(id: string, effect: TokenEffect): void {
    this.#editToken(id, (t) => (t.effects = toggled(t.effects, effect)));
  }

  setTokenLight(id: string, light: TokenLight | null): void {
    this.#editToken(id, (t) => {
      t.light = light;
      const { lighting } = layerOf(this.map!, t.level);
      if (light && lighting.darkness === 0) lighting.darkness = 0.75;
    }, false);
  }

  setInitiatives(values: Record<string, number | null>): void {
    this.#edit((map) => {
      for (const t of map.tokens) if (t.id in values) t.initiative = values[t.id];
    });
  }

  startCombat(): void {
    this.#edit((map) => (map.combat = startCombat(map.tokens)));
    this.#showTurn();
  }

  nextTurn(step: 1 | -1): void {
    this.#edit((map) => (map.combat = advanceTurn(map.tokens, map.combat, step)));
    this.#showTurn();
  }

  #showTurn(): void {
    if (this.map?.combat.turn) this.selectedId = this.map.combat.turn;
  }

  /** Mit dem Kampf enden auch die Initiativen — der nächste Kampf würfelt neu. */
  endCombat(): void {
    this.#edit((map) => {
      map.combat = { round: 0, turn: '' };
      for (const t of map.tokens) t.initiative = null;
    });
  }

  setEncounterHidden(encounter: string, hidden: boolean): void {
    this.#edit((map) => {
      for (const t of map.tokens) if (t.encounter === encounter) t.hidden = hidden;
    });
  }

  /** Ein ausgeblendeter Encounter nimmt seine Tokens mit von der Karte; Einblenden stellt sie zurück. */
  setEncounterOffered(encounter: string, offered: boolean): void {
    let moving: Token[] = [];
    this.#edit((map) => {
      const [from, to] = offered ? [map.parkedTokens, map.tokens] : [map.tokens, map.parkedTokens];
      moving = from.filter((t) => t.encounter === encounter);
      if (offered) map.parkedTokens = from.filter((t) => t.encounter !== encounter);
      else map.tokens = from.filter((t) => t.encounter !== encounter);
      to.push(...moving);
      map.hiddenEncounters = offered ? map.hiddenEncounters.filter((k) => k !== encounter) : [...map.hiddenEncounters, encounter];
    });
    if (offered) this.#refreshTokenImages(moving);
    else for (const t of moving) this.details.forget(t.id);
  }

  addFogOp(op: FogOp): void {
    if (!this.map) return;
    this.layer.fog.ops.push(op);
    this.changed();
  }

  /** Alte Operationen fallen weg — ein „alles" überdeckt sie ohnehin. */
  setFogAll(revealed: boolean): void {
    const { w, h } = this.images.frame;
    this.#edit(() => (this.layer.fog.ops = revealed ? [{ shape: 'rect', mode: 'reveal', x: 0, y: 0, w: Math.max(w, 1), h: Math.max(h, 1) }] : []));
  }

  addLight(at: Point): void {
    this.#edit(() => {
      const { lighting } = this.layer;
      lighting.lights.push({ id: newUid(), x: at.x, y: at.y, radius: 4, color: '#ffb347' } satisfies Light);
      if (lighting.darkness === 0) lighting.darkness = 0.75;
    });
  }

  removeLight(id: string): void {
    this.#edit(() => (this.layer.lighting.lights = this.layer.lighting.lights.filter((l) => l.id !== id)));
  }

  addLevel(direction: 1 | -1): void {
    this.#edit((map) => (this.level = addLevel(map, direction, newUid()).id));
  }

  removeLevel(id: string): void {
    if (id === BASE_LEVEL) return;
    this.#edit((map) => {
      for (const t of removeLevel(map, id)) this.details.forget(t);
      this.level = resolveLevel(map, this.level);
    });
  }

  /** Bild auf/ab: eine Ebene höher bzw. tiefer, am Ende bleibt sie stehen. */
  stepLevel(direction: 1 | -1): void {
    if (!this.map) return;
    const stack = levelStack(this.map);
    const i = stack.findIndex((l) => l.id === this.level) - direction;
    if (stack[i]) this.level = stack[i].id;
  }

  showLevelToPlayers(id: string): void {
    this.#edit((map) => (map.playerLevel = resolveLevel(map, id)));
  }

  calibrateGrid(rect: ViewRect): void {
    if (rect.w < 4 || rect.h < 4) return;
    this.#edit((map) => Object.assign(map.grid, gridFromCell(rect)));
  }

  setPlayerView(rect: ViewRect | null): void {
    if (!this.map) return;
    this.map.playerView = rect;
    this.changed();
  }
}

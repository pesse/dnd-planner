/** Stockwerke einer Karte: die Grundebene trägt die Karte selbst, weitere stehen in `map.levels`. */
import type { BattleMap, MapLevel, Token } from '../../schemas/battleMap';
import { fogSchema, lightingSchema } from '../../schemas/battleMap';

export const BASE_LEVEL = '';

export type LevelLayer = Pick<MapLevel, 'image' | 'offsetX' | 'offsetY' | 'fog' | 'lighting'>;

/** Ein Ebenenbild in Pixeln der Grundebene. */
export interface PlacedImage {
  url: string;
  x: number;
  y: number;
}

export interface LevelEntry {
  id: string;
  name: string;
  elevation: number;
}

const levelOf = (map: BattleMap, id: string): MapLevel | undefined => map.levels.find((l) => l.id === id);

/** Unbekannte IDs fallen auf die Grundebene — etwa nach dem Löschen einer Ebene. */
export const resolveLevel = (map: BattleMap, id: string): string => (levelOf(map, id) ? id : BASE_LEVEL);

/** `fog` und `lighting` sind dieselben Objekte wie in der Karte, Änderungen daran landen also in ihr. */
export function layerOf(map: BattleMap, id: string): LevelLayer {
  return levelOf(map, id) ?? { image: map.image, offsetX: 0, offsetY: 0, fog: map.fog, lighting: map.lighting };
}

export const baseLevelName = (map: BattleMap): string => map.baseLevelName || 'Grundebene';

/** Von oben nach unten, wie ein Gebäudeschnitt. */
export function levelStack(map: BattleMap): LevelEntry[] {
  const base = { id: BASE_LEVEL, name: baseLevelName(map), elevation: 0 };
  return [base, ...map.levels.map(({ id, name, elevation }) => ({ id, name, elevation }))].sort((a, b) => b.elevation - a.elevation);
}

export const levelName = (map: BattleMap, id: string): string => levelOf(map, id)?.name ?? baseLevelName(map);

/** Die Ebene, die durch transparente Stellen von `id` hindurchscheint. */
export function levelBelow(map: BattleMap, id: string): string | null {
  const stack = levelStack(map);
  const i = stack.findIndex((l) => l.id === resolveLevel(map, id));
  return stack[i + 1]?.id ?? null;
}

/** Bild der Ebene samt der Ebene darunter, die durch seine transparenten Stellen scheint. */
export function placedImages(map: BattleMap, level: string, urls: Record<string, string>): { image: PlacedImage; underlay: PlacedImage | null } {
  const place = (id: string): PlacedImage => {
    const { offsetX, offsetY } = layerOf(map, id);
    return { url: urls[id] ?? '', x: offsetX, y: offsetY };
  };
  const below = levelBelow(map, level);
  return { image: place(resolveLevel(map, level)), underlay: below !== null && urls[below] ? place(below) : null };
}

export const tokensOn = <T extends Pick<Token, 'level'>>(tokens: readonly T[], level: string): T[] => tokens.filter((t) => t.level === level);

/** Die Charaktere, die die Spieler auf der Ebene sehen — die Gruppe, die eine Treppe gemeinsam nimmt. */
export const partyOn = (map: BattleMap, level: string): Token[] => tokensOn(map.tokens, level).filter((t) => t.kind === 'character' && !t.hidden);

const cellsOf = (x: number, y: number, size: number): string[] => {
  const n = Math.max(1, Math.ceil(size));
  const cells: string[] = [];
  for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) cells.push(`${Math.floor(x) + dx},${Math.floor(y) + dy}`);
  return cells;
};

/** Ringweise um das Feld herum, damit ein Token nur so weit ausweicht wie nötig. */
function nearestFree(taken: Set<string>, t: Pick<Token, 'x' | 'y' | 'size'>): Pick<Token, 'x' | 'y'> {
  const free = (x: number, y: number) => cellsOf(x, y, t.size).every((c) => !taken.has(c));
  if (free(t.x, t.y)) return { x: t.x, y: t.y };
  const ox = Math.floor(t.x);
  const oy = Math.floor(t.y);
  for (let r = 1; r < 100; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ox + dx >= 0 && oy + dy >= 0 && free(ox + dx, oy + dy)) return { x: ox + dx, y: oy + dy };
  return { x: t.x, y: t.y };
}

/** Die Tokens behalten ihr Feld; steht dort auf der Zielebene schon etwas, weichen sie aufs nächste freie aus. */
export function moveToLevel(map: BattleMap, ids: readonly string[], level: string): void {
  const moving = map.tokens.filter((t) => ids.includes(t.id) && t.level !== level);
  const taken = new Set(tokensOn(map.tokens, level).flatMap((t) => cellsOf(t.x, t.y, t.size)));
  for (const t of moving) {
    Object.assign(t, nearestFree(taken, t), { level });
    for (const c of cellsOf(t.x, t.y, t.size)) taken.add(c);
  }
}

function defaultName(elevation: number): string {
  if (elevation === 1) return 'Obergeschoss';
  if (elevation === -1) return 'Keller';
  return elevation > 0 ? `${elevation}. Obergeschoss` : `${-elevation}. Untergeschoss`;
}

export function addLevel(map: BattleMap, direction: 1 | -1, id: string): MapLevel {
  const elevations = [0, ...map.levels.map((l) => l.elevation)];
  const elevation = direction > 0 ? Math.max(...elevations) + 1 : Math.min(...elevations) - 1;
  const level: MapLevel = {
    id,
    name: defaultName(elevation),
    elevation,
    image: '',
    offsetX: 0,
    offsetY: 0,
    fog: fogSchema.parse({}),
    lighting: lightingSchema.parse({}),
  };
  map.levels.push(level);
  return level;
}

/** Tokens der Ebene gehen mit; die Spieler landen auf der Grundebene. @returns die IDs der entfernten Tokens. */
export function removeLevel(map: BattleMap, id: string): string[] {
  const gone = [...map.tokens, ...map.parkedTokens].filter((t) => t.level === id).map((t) => t.id);
  map.levels = map.levels.filter((l) => l.id !== id);
  map.tokens = map.tokens.filter((t) => t.level !== id);
  map.parkedTokens = map.parkedTokens.filter((t) => t.level !== id);
  if (map.playerLevel === id) map.playerLevel = BASE_LEVEL;
  return gone;
}

/** Alle Bilddateien der Karte, Grundebene zuerst — für Kopieren und Umbenennen. */
export const mapImageSlots = (map: BattleMap): { level: string; file: string }[] =>
  [{ level: BASE_LEVEL, file: map.image }, ...map.levels.map((l) => ({ level: l.id, file: l.image }))].filter((s) => s.file);

export const withLevelImage = (map: BattleMap, level: string, file: string): BattleMap =>
  level === BASE_LEVEL ? { ...map, image: file } : { ...map, levels: map.levels.map((l) => (l.id === level ? { ...l, image: file } : l)) };

/** `<karte>.<endung>` für die Grundebene, `<karte>-<ebene>.<endung>` für die übrigen. */
export const levelImageBase = (mapBase: string, level: string): string => (level ? `${mapBase}-${level}` : mapBase);

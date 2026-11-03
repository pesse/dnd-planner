/** Tokens aus Gruppe, Encounter, Monster- und Fallenbibliothek anlegen und ihre Bilder auflösen. */
import { invoke } from '@tauri-apps/api/core';
import { artUrl } from '../../artUrl';
import { monsterArtSlug } from '../../libraryArt';
import { TRAP_ICON_URL } from '../../conditionIcon';
import type { Token, TokenKind } from '../../schemas/battleMap';
import { encounterSchema } from '../../schemas/encounter';
import type { Monster } from '../../types';
import { newUid } from '../../utils/uid';
import { normalizeCharacter } from '../../utils/schemaValidation';
import { CHARACTERS_PATH } from '../characterDirectory';
import { resolveCharacterPortrait } from '../characterPortrait.svelte';
import { fetchEncounterMonsters } from '../contextLoad';
import { cellsForCreatureSize, type Point } from './geometry';

export interface TokenDraft {
  name: string;
  kind: TokenKind;
  ref: string;
  art: string;
  size: number;
  hidden: boolean;
  color: string;
  note: string;
  encounter: string;
  hp: number | null;
  hpMax: number | null;
  conditions: Token['conditions'];
  effects: Token['effects'];
  initiative: number | null;
  trapState?: Token['trapState'];
  trapTier?: number;
}

export const KIND_COLOR: Record<TokenKind, string> = {
  character: '#205c50',
  monster: '#8a2012',
  marker: '#786012',
  trap: '#4a0d0d',
};

const ROW = 6;

/** Felder, die ein Token belegt — als `"x,y"` der ganzen Felder unter ihm. */
export function occupiedCells(tokens: Pick<Token, 'x' | 'y' | 'size'>[]): Set<string> {
  const cells = new Set<string>();
  for (const t of tokens) {
    const n = Math.max(1, Math.ceil(t.size));
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) cells.add(`${Math.floor(t.x) + dx},${Math.floor(t.y) + dy}`);
  }
  return cells;
}

/**
 * Legt die Entwürfe zeilenweise (je `ROW` Felder breit) ab `origin` ab und überspringt
 * Felder, auf denen schon etwas steht.
 */
export function placeDrafts(drafts: TokenDraft[], origin: Point, taken: Set<string> = new Set()): Token[] {
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  const used = new Set(taken);
  const fits = (x: number, y: number, n: number) => {
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) if (used.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  return drafts.map((d) => {
    const n = Math.max(1, Math.ceil(d.size));
    let i = 0;
    while (!fits(ox + (i % ROW), oy + Math.floor(i / ROW), n)) i++;
    const x = ox + (i % ROW);
    const y = oy + Math.floor(i / ROW);
    for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) used.add(`${x + dx},${y + dy}`);
    return { id: newUid(), x, y, trapState: 'armed', trapTier: 0, ...d };
  });
}

/** Mehrere gleiche Monster bekommen eine Nummer, ein einzelnes bleibt ohne. */
export function numberedNames(name: string, count: number): string[] {
  return count <= 1 ? [name] : Array.from({ length: count }, (_, i) => `${name} ${i + 1}`);
}

export const monsterDraft = (monster: Monster, ref: string, name = monster.name, encounter = ''): TokenDraft => ({
  name,
  kind: 'monster',
  ref,
  art: `monsters/${monsterArtSlug(monster)}`,
  size: cellsForCreatureSize(monster.size),
  hidden: true,
  color: KIND_COLOR.monster,
  note: '',
  encounter,
  hp: monster.hit_points || null,
  hpMax: monster.hit_points || null,
  conditions: [],
  effects: [],
  initiative: null,
});

export const characterDraft = (uid: string, name: string): TokenDraft => ({
  name,
  kind: 'character',
  ref: uid,
  art: '',
  size: 1,
  hidden: false,
  color: KIND_COLOR.character,
  note: '',
  encounter: '',
  hp: null,
  hpMax: null,
  conditions: [],
  effects: [],
  initiative: null,
});

export const markerDraft = (name: string): TokenDraft => ({
  name,
  kind: 'marker',
  ref: '',
  art: '',
  size: 1,
  hidden: false,
  color: KIND_COLOR.marker,
  note: '',
  encounter: '',
  hp: null,
  hpMax: null,
  conditions: [],
  effects: [],
  initiative: null,
});

/** Fallen liegen verborgen, bis die Spieler sie entdecken oder auslösen. */
export const trapDraft = (name: string, ref = ''): TokenDraft => ({
  ...markerDraft(name),
  kind: 'trap',
  ref,
  hidden: true,
  color: KIND_COLOR.trap,
});

/** Monster sind zunächst versteckt — die SL deckt sie auf, wenn sie auftauchen. */
export async function encounterDrafts(encounterPath: string, key: string): Promise<TokenDraft[]> {
  const raw = await invoke<string>('read_file_content', { path: encounterPath });
  const encounter = encounterSchema.parse(JSON.parse(raw));
  const drafts: TokenDraft[] = [];
  for (const entry of encounter.monsters) {
    // Einzeln aufgelöst: `fetchEncounterMonsters` lässt Unauflösbare weg, die Zuordnung zum Eintrag ginge verloren.
    const [monster] = await fetchEncounterMonsters(JSON.stringify({ monsters: [entry] }), encounterPath);
    if (!monster) continue;
    for (const name of numberedNames(monster.name, entry.count)) drafts.push(monsterDraft(monster, entry.slug, name, key));
  }
  return drafts;
}

export async function libraryMonsterDraft(slug: string): Promise<TokenDraft | null> {
  const [monster] = await fetchEncounterMonsters(JSON.stringify({ monsters: [{ slug }] }));
  return monster ? monsterDraft(monster, slug) : null;
}

/** Leer, wenn es kein Bild gibt — das Token zeigt dann seine Initialen. */
export async function resolveTokenImage(token: Token): Promise<string> {
  if (token.kind === 'character' && token.ref) {
    try {
      const dir = `${CHARACTERS_PATH}/${token.ref}`;
      const raw = await invoke<string>('read_file_content', { path: `${dir}/character.json` });
      return (await resolveCharacterPortrait(normalizeCharacter(JSON.parse(raw)), dir)) ?? '';
    } catch {
      return '';
    }
  }
  if (token.kind === 'trap') return TRAP_ICON_URL;
  return token.art ? artUrl(token.art) : '';
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('');

/**
 * Kurzer Name für die Beschriftung auf der Karte: das erste Wort, gekürzt, eine laufende Nummer
 * bleibt stehen — sonst wären „Goblin-Krieger 2" und „… 3" nicht mehr zu unterscheiden.
 */
export function shortName(name: string, max = 8): string {
  const [, base, num] = name.trim().match(/^(.*?)(?:\s+(\d+))?$/) ?? [];
  const first = (base ?? '').split(/\s+/)[0] ?? '';
  const short = first.length > max ? `${first.slice(0, max - 1)}…` : first;
  return num ? `${short} ${num}` : short;
}

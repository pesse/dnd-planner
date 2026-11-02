/** Tokens aus Gruppe, Encounter und Monsterbibliothek anlegen und ihre Bilder auflösen. */
import { invoke } from '@tauri-apps/api/core';
import { artUrl } from '../../artUrl';
import { monsterArtSlug } from '../../libraryArt';
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
}

export const KIND_COLOR: Record<TokenKind, string> = {
  character: '#205c50',
  monster: '#8a2012',
  marker: '#786012',
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
    return { id: newUid(), x, y, ...d };
  });
}

/** Mehrere gleiche Monster bekommen eine Nummer, ein einzelnes bleibt ohne. */
export function numberedNames(name: string, count: number): string[] {
  return count <= 1 ? [name] : Array.from({ length: count }, (_, i) => `${name} ${i + 1}`);
}

export const monsterDraft = (monster: Monster, ref: string, name = monster.name): TokenDraft => ({
  name,
  kind: 'monster',
  ref,
  art: `monsters/${monsterArtSlug(monster)}`,
  size: cellsForCreatureSize(monster.size),
  hidden: true,
  color: KIND_COLOR.monster,
});

export const characterDraft = (uid: string, name: string): TokenDraft => ({
  name,
  kind: 'character',
  ref: uid,
  art: '',
  size: 1,
  hidden: false,
  color: KIND_COLOR.character,
});

export const markerDraft = (name: string): TokenDraft => ({
  name,
  kind: 'marker',
  ref: '',
  art: '',
  size: 1,
  hidden: false,
  color: KIND_COLOR.marker,
});

/** Monster sind zunächst versteckt — die SL deckt sie auf, wenn sie auftauchen. */
export async function encounterDrafts(encounterPath: string): Promise<TokenDraft[]> {
  const raw = await invoke<string>('read_file_content', { path: encounterPath });
  const encounter = encounterSchema.parse(JSON.parse(raw));
  const drafts: TokenDraft[] = [];
  for (const entry of encounter.monsters) {
    // Einzeln aufgelöst: `fetchEncounterMonsters` lässt Unauflösbare weg, die Zuordnung zum Eintrag ginge verloren.
    const [monster] = await fetchEncounterMonsters(JSON.stringify({ monsters: [entry] }), encounterPath);
    if (!monster) continue;
    for (const name of numberedNames(monster.name, entry.count)) drafts.push(monsterDraft(monster, entry.slug, name));
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
  return token.art ? artUrl(token.art) : '';
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('');

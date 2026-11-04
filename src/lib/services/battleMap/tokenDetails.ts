/** Was hinter einem Token steht: Encounter, Monster-Werte, Charakterdatei. Karten liegen unter `<kampagne>/maps/`. */
import { invoke } from '@tauri-apps/api/core';
import { encounterSchema, type Encounter } from '../../schemas/encounter';
import type { BattleMap, Token } from '../../schemas/battleMap';
import type { FileEntry, Monster } from '../../types';
import { CHARACTERS_PATH } from '../characterDirectory';
import { fetchEncounterMonsters } from '../contextLoad';

export const campaignDirOf = (mapPath: string): string => mapPath.replace(/\/(maps|map-templates)\/[^/]+$/, '');

/**
 * `<akt>/<encounter>` oder, für einen Encounter der ganzen Kampagne, nur `<encounter>` — derselbe
 * Schlüssel wie in `encounterSummaries`, unabhängig vom Kampagnenordner.
 */
export const encounterKey = (actSlug: string, slug: string): string => (actSlug ? `${actSlug}/${slug}` : slug);

export const encounterDir = (campaignDir: string, actSlug: string): string =>
  actSlug ? `${campaignDir}/acts/${actSlug}/encounters` : `${campaignDir}/encounters`;

export const encounterPath = (campaignDir: string, key: string): string => {
  const [act, slug] = key.includes('/') ? key.split('/') : ['', key];
  return `${encounterDir(campaignDir, act)}/${slug}.json`;
};

export const encounterKeyOf = (path: string): string => {
  const m = /\/acts\/([^/]+)\/encounters\/([^/]+)\.json$/.exec(path) ?? /\/campaigns\/[^/]+()\/encounters\/([^/]+)\.json$/.exec(path);
  return m ? encounterKey(m[1], m[2]) : '';
};

/**
 * Eine Karte bietet die Encounter ihrer Akte und die der ganzen Kampagne an, eine Vorlage alle.
 * Ein schon gesetzter (oder mit seinen Tokens ausgeblendeter) Encounter bleibt in der Liste, auch wenn sein Akt nicht zur Karte gehört.
 */
export function mapEncounters<E extends { actSlug: string; slug: string }>(
  all: readonly E[],
  map: Pick<BattleMap, 'acts' | 'tokens'> & Partial<Pick<BattleMap, 'parkedTokens'>>,
  isTemplate: boolean,
): (E & { key: string })[] {
  const placed = new Set([...map.tokens, ...(map.parkedTokens ?? [])].map((t) => t.encounter).filter(Boolean));
  return all
    .map((e) => ({ ...e, key: encounterKey(e.actSlug, e.slug) }))
    .filter((e) => isTemplate || !e.actSlug || map.acts.includes(e.actSlug) || placed.has(e.key));
}

export function splitHiddenEncounters<E extends { key: string }>(
  list: readonly E[],
  map: Pick<BattleMap, 'hiddenEncounters'>,
): { shown: E[]; hidden: E[] } {
  const isHidden = (e: E) => map.hiddenEncounters.includes(e.key);
  return { shown: list.filter((e) => !isHidden(e)), hidden: list.filter(isHidden) };
}

export async function loadEncounter(path: string): Promise<Encounter | null> {
  try {
    return encounterSchema.parse(JSON.parse(await invoke<string>('read_file_content', { path })));
  } catch {
    return null;
  }
}

/** Akt-lokale Werte schlagen die Bibliothek, sobald das Token zu einem Encounter gehört. */
export async function loadTokenMonster(token: Pick<Token, 'ref' | 'encounter'>, campaignDir: string): Promise<Monster | null> {
  const enc = token.encounter ? encounterPath(campaignDir, token.encounter) : undefined;
  const [monster] = await fetchEncounterMonsters(JSON.stringify({ monsters: [{ slug: token.ref }] }), enc);
  return monster ?? null;
}

export const characterEntry = (uid: string, name: string): FileEntry => ({
  name,
  type: 'character',
  path: `${CHARACTERS_PATH}/${uid}/character.json`,
  dirPath: `${CHARACTERS_PATH}/${uid}`,
});

/** Neue TP nach Schaden (negativ) oder Heilung, zwischen 0 und Maximum. Ohne gezählte TP gilt `fallbackMax` als voll. */
export function adjustHp(token: Pick<Token, 'hp' | 'hpMax'>, fallbackMax: number, delta: number): Pick<Token, 'hp' | 'hpMax'> {
  const hpMax = token.hpMax ?? fallbackMax;
  const hp = Math.max(0, Math.min(hpMax, (token.hp ?? hpMax) + delta));
  return { hp, hpMax };
}

/** Wie `adjustHp`, holt aber das Maximum aus dem Werteblock, solange das Token noch keine gezählten TP hat. */
export async function hpAfter(token: Token, campaignDir: string, delta: number): Promise<Pick<Token, 'hp' | 'hpMax'> | null> {
  if (token.hpMax != null) return adjustHp(token, token.hpMax, delta);
  const monster = token.kind === 'monster' && token.ref ? await loadTokenMonster(token, campaignDir) : null;
  return monster ? adjustHp(token, monster.hit_points, delta) : null;
}

/** Blutig: höchstens die Hälfte der TP, aber nicht besiegt. */
export const isBloodied = ({ hp, hpMax }: Pick<Token, 'hp' | 'hpMax'>): boolean =>
  hp != null && hpMax != null && hp > 0 && hp <= hpMax / 2;

export const concentrationDc = (damage: number): number => Math.min(30, Math.max(10, Math.floor(damage / 2)));

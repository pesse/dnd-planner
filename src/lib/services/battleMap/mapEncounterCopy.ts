/** Zieht eine Karte in eine andere Kampagne oder einen anderen Akt, kommen ihre Encounter samt eigener Monsterwerte mit. */
import { invoke } from '@tauri-apps/api/core';
import type { BattleMap } from '../../schemas/battleMap';
import { extractActTitle } from '../../utils/actExtract';
import { encounterKey, encounterPath } from './tokenDetails';

const baseOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await invoke<string>('read_file_content', { path });
  } catch {
    return null;
  }
}

async function jsonBases(dir: string): Promise<Set<string>> {
  const files = await invoke<string[]>('list_json_files', { path: dir }).catch(() => [] as string[]);
  return new Set(files.map(baseOf));
}

export const encounterKeysOf = (map: Pick<BattleMap, 'tokens'>): string[] =>
  [...new Set(map.tokens.map((t) => t.encounter).filter((k): k is string => !!k))];

/** Fehlt der Akt im Ziel, entsteht er nur mit seinem Titel — der Akttext gehört zur alten Kampagne. */
async function ensureAct(fromDir: string, toDir: string, act: string): Promise<void> {
  const target = `${toDir}/acts/${act}/index.md`;
  if ((await readOrNull(target)) !== null) return;
  const source = (await readOrNull(`${fromDir}/acts/${act}/index.md`)) ?? '';
  await invoke('write_file_content', { path: target, content: `# ${extractActTitle(source, act)}\n` });
}

/** Was im Ziel schon unter demselben Namen liegt, bleibt unangetastet — es kann dort gespielt worden sein. */
async function copyMissing(from: string, to: string, taken: Set<string>): Promise<void> {
  if (taken.has(baseOf(to))) return;
  const content = await readOrNull(from);
  if (content !== null) await invoke('write_file_content', { path: to, content });
}

const actOf = (key: string): string => (key.includes('/') ? key.split('/')[0] : '');
const slugOf = (key: string): string => key.split('/').pop()!;
const scopeDir = (campaignDir: string, act: string): string => (act ? `${campaignDir}/acts/${act}` : campaignDir);

async function copyEncounter(fromDir: string, fromKey: string, toDir: string, toKey: string): Promise<void> {
  if (fromDir === toDir && fromKey === toKey) return;
  const source = await readOrNull(encounterPath(fromDir, fromKey));
  if (source === null) return;
  const toAct = actOf(toKey);
  if (toAct) await ensureAct(fromDir, toDir, toAct);
  const target = encounterPath(toDir, toKey);
  await copyMissing(encounterPath(fromDir, fromKey), target, await jsonBases(target.slice(0, target.lastIndexOf('/'))));

  const monsters = (JSON.parse(source) as { monsters?: { slug: string }[] }).monsters ?? [];
  const from = `${scopeDir(fromDir, actOf(fromKey))}/monsters`;
  const to = `${scopeDir(toDir, toAct)}/monsters`;
  const taken = await jsonBases(to);
  for (const { slug } of monsters) await copyMissing(`${from}/${slug}.json`, `${to}/${slug}.json`, taken);
}

/**
 * `fromDir`/`toDir` sind Kampagnenordner (`./vault/campaigns/<kampagne>`). Mit `act` ziehen
 * Encounter fremder Akte in diesen Akt um, und die Tokens zeigen danach dorthin.
 */
export async function copyMapEncounters<M extends Pick<BattleMap, 'tokens'>>(map: M, fromDir: string, toDir: string, act = ''): Promise<M> {
  const moved = new Map<string, string>();
  for (const key of encounterKeysOf(map)) {
    const toKey = act && actOf(key) && actOf(key) !== act ? encounterKey(act, slugOf(key)) : key;
    await copyEncounter(fromDir, key, toDir, toKey);
    moved.set(key, toKey);
  }
  return { ...map, tokens: map.tokens.map((t) => (t.encounter ? { ...t, encounter: moved.get(t.encounter) ?? t.encounter } : t)) };
}

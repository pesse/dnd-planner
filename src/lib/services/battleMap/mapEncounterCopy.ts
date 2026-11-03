/** Zieht eine Karte in eine andere Kampagne, kommen ihre Encounter samt akt-eigener Monsterwerte mit. */
import { invoke } from '@tauri-apps/api/core';
import type { BattleMap } from '../../schemas/battleMap';
import { extractActTitle } from '../../utils/actExtract';
import { encounterPath } from './tokenDetails';

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

/** `fromDir`/`toDir` sind Kampagnenordner (`./vault/campaigns/<kampagne>`). */
export async function copyMapEncounters(map: Pick<BattleMap, 'tokens'>, fromDir: string, toDir: string): Promise<void> {
  if (fromDir === toDir) return;
  for (const key of encounterKeysOf(map)) {
    const [act] = key.split('/');
    const source = await readOrNull(encounterPath(fromDir, key));
    if (source === null) continue;
    await ensureAct(fromDir, toDir, act);
    const target = encounterPath(toDir, key);
    await copyMissing(encounterPath(fromDir, key), target, await jsonBases(target.slice(0, target.lastIndexOf('/'))));

    const monsters = (JSON.parse(source) as { monsters?: { slug: string }[] }).monsters ?? [];
    const monsterDir = (dir: string) => `${dir}/acts/${act}/monsters`;
    const taken = await jsonBases(monsterDir(toDir));
    for (const { slug } of monsters) {
      await copyMissing(`${monsterDir(fromDir)}/${slug}.json`, `${monsterDir(toDir)}/${slug}.json`, taken);
    }
  }
}

/** Lese-Index der Fallen-Bibliotheken. */
import { createLibrary, type LibraryEntry } from './services/library/createLibrary';
import { memoOnce } from './services/library/memo';
import { normalizeTrap } from './utils/schemaValidation';
import type { Trap } from './schemas/trap';

export const TRAPS_PATH = './vault/traps';

export type TrapInfo = Trap & LibraryEntry;

export function trapDisplayName(t: Pick<Trap, 'name' | 'nameDe'>): string {
  return t.nameDe || t.name;
}

const library = createLibrary<TrapInfo>({
  path: TRAPS_PATH,
  displayName: trapDisplayName,
  key: (t) => t.key,
  read: (raw, { path }) => ({ ...normalizeTrap(raw), path }),
});

const byKey = memoOnce(async () => new Map((await library.list()).map((t) => [t.key, t])));

export const getTraps = library.list;
export const searchTrapDrafts = library.searchWithParser;

export async function getTrapByKey(key: string): Promise<TrapInfo | undefined> {
  return (await byKey.get()).get(key);
}

export function invalidateTrapsCache(): void {
  library.invalidate();
  byKey.invalidate();
}

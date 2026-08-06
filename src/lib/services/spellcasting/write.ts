/**
 * Die Zugriffe auf `character.spellcasting`. Editor, Wizard und Stufenaufstieg gehen hier
 * durch, damit die Blockstruktur an einer Stelle entsteht.
 */
import { emptyCharacterSpellcasting, type CastingSourceState, type CharacterSpellcasting } from '$lib/schemas/spellcasting';

export const emptySpellcasting = emptyCharacterSpellcasting;

// JSON-Rundlauf, nicht `structuredClone`: der Block kommt aus dem Formular und ist dort ein
// Svelte-$state-Proxy, an dem `structuredClone` mit DataCloneError abbricht.
export const cloneSpellcasting = (block: CharacterSpellcasting): CharacterSpellcasting =>
  JSON.parse(JSON.stringify(block)) as CharacterSpellcasting;

function sourceState(block: CharacterSpellcasting, sourceId: string): CastingSourceState {
  const existing = block.sources[sourceId];
  if (existing) return existing;
  const fresh: CastingSourceState = { picks: {}, uses: {} };
  block.sources[sourceId] = fresh;
  return fresh;
}

function manual(block: CharacterSpellcasting): NonNullable<CharacterSpellcasting['manual']> {
  block.manual ??= { slotTotals: [], extra: [] };
  return block.manual;
}

/** Die gespeicherte Auswahl einer Quota; leer heißt „nichts gewählt". */
export const pickedKeys = (block: CharacterSpellcasting, sourceId: string, quotaId: string): string[] =>
  block.sources[sourceId]?.picks[quotaId] ?? [];

/** Leere Auswahl heißt „nichts gewählt", nicht „Quota gelöscht" — der leere Eintrag bleibt. */
export function setPicks(
  block: CharacterSpellcasting,
  sourceId: string,
  quotaId: string,
  keys: string[],
): void {
  sourceState(block, sourceId).picks[quotaId] = [...new Set(keys.filter(Boolean))];
}

/** Additiv, anders als `setPicks`: ein Aufstieg legt Zauber ZU der bestehenden Auswahl. */
export function addPick(block: CharacterSpellcasting, sourceId: string, quotaId: string, key: string): void {
  if (!key.trim()) return;
  const picks = sourceState(block, sourceId).picks;
  const list = picks[quotaId] ?? [];
  if (!list.includes(key)) picks[quotaId] = [...list, key];
}

export function setUses(block: CharacterSpellcasting, sourceId: string, quotaId: string, used: number): void {
  sourceState(block, sourceId).uses[quotaId] = Math.max(0, used);
}

export function setSlotUsed(block: CharacterSpellcasting, level: number, used: number): void {
  const arr = block.pools.standard.used;
  while (arr.length < level) arr.push(0);
  arr[level - 1] = Math.max(0, used);
}

export function setPactUsed(block: CharacterSpellcasting, used: number): void {
  block.pools.pact.used = Math.max(0, used);
}

export function setSlotTotals(block: CharacterSpellcasting, totals: number[]): void {
  if (!totals.some((n) => n > 0)) {
    if (block.manual) block.manual.slotTotals = [];
    return;
  }
  manual(block).slotTotals = totals;
}

export function addExtra(block: CharacterSpellcasting, key: string): void {
  if (!key.trim()) return;
  const extra = manual(block).extra;
  if (!extra.includes(key)) extra.push(key);
}

export function removeExtra(block: CharacterSpellcasting, key: string): void {
  if (!block.manual) return;
  block.manual.extra = block.manual.extra.filter((k) => k !== key);
}

/** Quellen, die nichts tragen, fallen beim Speichern heraus. */
export function pruneSpellcasting(block: CharacterSpellcasting): CharacterSpellcasting {
  const sources: CharacterSpellcasting['sources'] = {};
  for (const [id, state] of Object.entries(block.sources)) {
    const picks = Object.fromEntries(Object.entries(state.picks).filter(([, keys]) => keys.length > 0));
    const uses = Object.fromEntries(Object.entries(state.uses).filter(([, n]) => n > 0));
    if (!Object.keys(picks).length && !Object.keys(uses).length) continue;
    sources[id] = { picks, uses };
  }
  const manualBlock = block.manual;
  const keepManual = !!manualBlock && (manualBlock.slotTotals.some((n) => n > 0) || manualBlock.extra.length > 0);
  return {
    pools: block.pools,
    sources,
    ...(keepManual ? { manual: manualBlock } : {}),
  };
}

/**
 * Zauber, die der Charakter anderswo schon beherrscht. Der Picker gräut sie aus, verbietet
 * sie aber nicht: Doppeln ist erlaubt, es soll nur nicht aus Versehen passieren.
 */
import type { GroupedSpellcasting } from './grouped';

/** `spell.key` → woher der Zauber schon kommt, deutsch. */
export type KnownSpells = ReadonlyMap<string, string>;

export const NO_KNOWN_SPELLS: KnownSpells = new Map();

export interface KnownSpellGroup {
  /** Ausschluss-Kennung: der Picker, der GENAU diese Zauber schreibt, meldet sie nicht als fremd. */
  id: string;
  label: string;
  keys: readonly string[];
}

export const quotaGroupId = (sourceId: string, quotaId: string): string => `${sourceId}::${quotaId}`;

export function knownSpells(
  groups: readonly KnownSpellGroup[],
  exclude: readonly string[] = [],
): KnownSpells {
  const skip = new Set(exclude);
  const acc = new Map<string, string[]>();
  for (const group of groups) {
    if (skip.has(group.id)) continue;
    for (const key of group.keys) {
      if (!key) continue;
      const labels = acc.get(key) ?? [];
      if (!labels.includes(group.label)) labels.push(group.label);
      acc.set(key, labels);
    }
  }
  return new Map([...acc].map(([key, labels]) => [key, labels.join(' · ')]));
}

/** Der gespeicherte Bestand als Gruppen — je Kontingent eine, plus der quellenlose Rest. */
export function knownSpellGroups(view: GroupedSpellcasting): KnownSpellGroup[] {
  const groups = view.sources.flatMap((source) =>
    source.quotas.map((quota) => ({
      id: quotaGroupId(quota.sourceId, quota.quotaId),
      label: source.featureDe ? `${source.label} (${source.featureDe})` : source.label,
      keys: quota.spells.map((s) => s.key),
    })),
  );
  groups.push({ id: 'extra', label: 'Ohne Quelle', keys: view.extra.map((s) => s.key) });
  return groups;
}

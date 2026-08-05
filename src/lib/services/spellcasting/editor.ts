/**
 * Der Zauber-Block des Charakter-Editors: je Quelle die Kontingente mit ihrer Auswahl,
 * die abgeleiteten Plätze und der quellenlose Bestand.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import { ABILITY_LABEL_DE } from '$lib/schemas/abilities';
import { sourceLabel, type ProjectionLookup } from './project';
import type { QuotaState, SpellcastingState } from './state';

export interface EditorSpell {
  key: string;
  label: string;
  level: number;
}

export interface EditorQuota {
  sourceId: string;
  quotaId: string;
  label: string;
  /** Wählbare Grade; leer = ohne Gradschranke. */
  levels: number[];
  /** Zauberlisten als englische Klassen-Keys; leer = ganze Bibliothek. */
  lists: string[];
  count: number;
  /** true = gewährt, nichts zu wählen. */
  fixed: boolean;
  spells: EditorSpell[];
  open: number;
}

export interface EditorSource {
  id: string;
  label: string;
  abilityDe: string;
  abilityOptions: AbilityName[];
  saveDC: number | null;
  attackBonus: number | null;
  quotas: EditorQuota[];
}

export interface EditorSlot {
  level: number;
  total: number;
  used: number;
}

export interface EditorSpellcasting {
  sources: EditorSource[];
  slots: EditorSlot[];
  pact: EditorSlot | null;
  /** true = keine Progression im Vault, die Plätze stehen von Hand. */
  manualSlots: boolean;
  extra: EditorSpell[];
}

/**
 * Die Quota-Id ist ein technischer Schlüssel; angezeigt wird, was sie mechanisch ist.
 * Bei fester Gewährung nennt die Zeile nur die Herkunft, die Zauber stehen daneben.
 */
export function quotaLabel(quota: QuotaState): string {
  const view = quota.view;
  const cantripsOnly = view.levels.length > 0 && view.levels.every((l) => l === 0);
  if (cantripsOnly) return 'Zaubertricks';
  if (view.fixed) return 'Gewährt';
  if (view.tier === 'known') return 'Zauberbuch';
  const range = view.levels.filter((l) => l > 0);
  if (!range.length) return 'Vorbereitet';
  return `Vorbereitet (Grad ${range[0]}–${range[range.length - 1]})`;
}

const spellOf = (key: string, lookup: ProjectionLookup): EditorSpell => {
  const info = lookup.spell(key);
  return { key, label: info?.name ?? key, level: info?.level ?? 0 };
};

export function editorSpellcasting(state: SpellcastingState, lookup: ProjectionLookup): EditorSpellcasting {
  const sources: EditorSource[] = state.sources.map((source) => ({
    id: source.source.id,
    label: sourceLabel(source.source, lookup),
    abilityDe: source.ability ? ABILITY_LABEL_DE[source.ability] : '',
    abilityOptions: source.ability ? [] : [...source.abilityOptions],
    saveDC: source.saveDC,
    attackBonus: source.attackBonus,
    quotas: source.quotas.map((quota) => ({
      sourceId: source.source.id,
      quotaId: quota.view.quotaId,
      label: quotaLabel(quota),
      levels: [...quota.view.levels],
      lists: [...quota.view.pool.lists],
      count: quota.view.count,
      fixed: quota.view.fixed,
      spells: quota.spells.map((key) => spellOf(key, lookup)),
      open: quota.open,
    })),
  }));

  const slots: EditorSlot[] = [];
  state.pools.standard.total.forEach((total, i) => {
    if (total > 0) slots.push({ level: i + 1, total, used: state.pools.standard.used[i] ?? 0 });
  });
  let pactLevel = 0;
  state.pools.pact.total.forEach((n, i) => { if (n > 0) pactLevel = i + 1; });

  return {
    sources,
    slots,
    pact: pactLevel
      ? { level: pactLevel, total: state.pools.pact.total[pactLevel - 1] ?? 0, used: state.pools.pact.used }
      : null,
    manualSlots: state.manualSlots,
    extra: state.extra.map((key) => spellOf(key, lookup)),
  };
}

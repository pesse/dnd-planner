/**
 * Eine Quota gegen die Stufe der Quelle: `since`, `when`, Kontingent, Grade und Pool.
 */
import type { AbilityKey } from '$lib/schemas/abilities';
import { abilityKeyOf } from '$lib/schemas/abilities';
import type { ClassProgression } from '$lib/schemas/classProgression';
import type { SpellSchool } from '$lib/schemas/vocabulary';
import { firstInt } from '$lib/utils/num';
import { columnValue } from '../classProgression';
import { parseSpellGrantRows } from '../grantedSpells';
import { slotLevels, type SpellPools } from './slots';
import {
  castingIssue,
  quotaSwap,
  type CastingIssue,
  type CastingSource,
  type CastOption,
  type Quota,
  type SwapRule,
} from './source';

export interface ResolvedPool {
  lists: string[];
  listMode: 'union' | 'choose-one';
  schools: SpellSchool[];
  /** Gewährte Zauber als `spell.key`. */
  keys: string[];
  /** Der Pool IST die Auswahl einer anderen Quota (Zauberbuch). */
  from?: { sourceId: string; quotaId: string };
}

export interface QuotaView {
  sourceId: string;
  quotaId: string;
  tier: 'known' | 'prepared';
  /** Wählbare Grade; leer = keine Gradschranke. */
  levels: number[];
  /** Wie viele gewählt werden; bei festem Pool die Zahl der gewährten Zauber. */
  count: number;
  /** true = nichts zu wählen, der Pool selbst ist die Gewährung. */
  fixed: boolean;
  pool: ResolvedPool;
  /** Das Kontingent, in das die Auswahl zusätzlich gehört (`into`) — gezählt wird sie hier. */
  into?: { sourceId: string; quotaId: string };
  swap: SwapRule;
  cast: CastOption[];
}

export interface QuotaContext {
  /** Spaltenwert der Stufentabelle der Quelle, auf ihrer Stufe. */
  column: (name: string) => string | undefined;
  /** Grade, für die der genannte Platz-Pool Plätze hergibt. */
  slotLevels: (pool: 'standard' | 'pact') => number[];
  /** Deklarierter Zaubername → `spell.key` (`resolveSpell` der Bibliothek). */
  spellKey: (name: string) => string | undefined;
}

export function quotaContext(
  prog: ClassProgression | null,
  level: number,
  pools: SpellPools,
  spellKey: (name: string) => string | undefined,
): QuotaContext {
  return {
    column: (name) => (prog ? columnValue(prog, name, level) : undefined),
    slotLevels: (pool) => slotLevels(pool === 'pact' ? pools.pact : pools.standard),
    spellKey,
  };
}

/** Der einzige `when`-Schlüssel, den der Flow beantworten kann. */
const BRANCH_KEY = 'option';

function branchMatches(source: CastingSource, quota: Quota, issues?: CastingIssue[]): boolean {
  if (!quota.when) return true;
  for (const [key, value] of Object.entries(quota.when)) {
    if (key !== BRANCH_KEY) {
      issues?.push(castingIssue('unknownBranchKey', source.featureKey, `${quota.id}: when.${key}`));
      return false;
    }
    if (value.trim() !== source.branch.trim()) return false;
  }
  return true;
}

/**
 * Dieselbe `id` mehrfach ist EIN Kontingent über mehrere Stufen (Mystic Arcanum,
 * Mondzirkel-Tabelle): das höchste erreichte `since` gewinnt.
 */
export function activeQuotas(source: CastingSource, issues?: CastingIssue[]): Quota[] {
  const best = new Map<string, Quota>();
  for (const quota of source.quotas) {
    if ((quota.since ?? 1) > source.level) continue;
    if (!branchMatches(source, quota, issues)) continue;
    const prev = best.get(quota.id);
    if (!prev || (quota.since ?? 1) >= (prev.since ?? 1)) best.set(quota.id, quota);
  }
  return [...best.values()];
}

/** Kumulativ: für die Stufe der Quelle und niedriger. */
function descTableNames(source: CastingSource, issues?: CastingIssue[]): string[] {
  const rows = parseSpellGrantRows(source.desc);
  if (!rows.length) {
    issues?.push(castingIssue('unreadableSpellTable', source.featureKey, 'pool.fromDescTable ohne Tabelle im desc'));
    return [];
  }
  const out: string[] = [];
  for (const row of rows) {
    if (row.level > source.level) continue;
    for (const name of row.names) if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Die Deklaration nennt Namen (Regeltext), der Charakter speichert Keys. */
function poolKeys(source: CastingSource, quota: Quota, ctx: QuotaContext, issues?: CastingIssue[]): string[] {
  const names = [...quota.pool.names];
  if (quota.pool.fromDescTable)
    for (const name of descTableNames(source, issues)) if (!names.includes(name)) names.push(name);

  const keys: string[] = [];
  for (const name of names) {
    const key = ctx.spellKey(name);
    if (!key) {
      issues?.push(castingIssue('unknownSpell', source.featureKey, `${quota.id}: ${name}`));
      continue;
    }
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function quotaLevels(quota: Quota, ctx: QuotaContext): number[] {
  if (!quota.levels) return [];
  if (Array.isArray(quota.levels)) return [...quota.levels];
  // Ohne Platz-Option gilt der Standard-Pool — das Zauberbuch trägt `cast: []`.
  const pool = quota.cast.find((c) => c.kind === 'slots')?.pool ?? 'standard';
  const slotted = ctx.slotLevels(pool);
  return quota.levels === 'cantrip-or-slotted' ? [0, ...slotted] : slotted;
}

function quotaCount(source: CastingSource, quota: Quota, keys: string[], ctx: QuotaContext): number {
  const count = quota.count;
  if (!count) return keys.length;
  if ('column' in count) return firstInt(ctx.column(count.column));
  return count.base + count.perLevel * Math.max(0, source.level - 1);
}

export function quotaView(
  source: CastingSource,
  quota: Quota,
  ctx: QuotaContext,
  issues?: CastingIssue[],
): QuotaView {
  const keys = poolKeys(source, quota, ctx, issues);
  const from = quota.pool.from;
  const into = quota.into;
  return {
    sourceId: source.id,
    quotaId: quota.id,
    tier: quota.tier,
    levels: quotaLevels(quota, ctx),
    count: quotaCount(source, quota, keys, ctx),
    fixed: !quota.count && keys.length > 0,
    pool: {
      lists: [...quota.pool.lists],
      listMode: quota.pool.listMode,
      schools: [...quota.pool.schools],
      keys,
      ...(from ? { from: { sourceId: from.feature || source.id, quotaId: from.quota } } : {}),
    },
    ...(into ? { into: { sourceId: into.feature || source.id, quotaId: into.quota } } : {}),
    swap: quotaSwap(source, quota),
    cast: quota.cast,
  };
}

export function quotaViews(
  source: CastingSource,
  ctx: QuotaContext,
  issues?: CastingIssue[],
): QuotaView[] {
  return activeQuotas(source, issues).map((q) => quotaView(source, q, ctx, issues));
}

export interface ClassQuotaRoles {
  cantrips: QuotaView | null;
  /** Zauberbuch ODER die einzige Zauber-Quota Grad 1+. */
  spells: QuotaView | null;
  /** Zieht aus `spells` (`pool.from`) — nur beim Zauberbuch-Regime gesetzt. */
  prepared: QuotaView | null;
}

/**
 * Zwei-Stufigkeit ist eine Pool-Komposition, kein Klassenname: die Quota mit `pool.from`
 * ist die Vorbereitung, die sie referenziert das Zauberbuch. Ohne eine solche Quota gibt es
 * nur „die eine" Zauber-Quota Grad 1+, offen oder fest je nach `swap`.
 */
export function classQuotaRoles(quotas: QuotaView[]): ClassQuotaRoles {
  const cantrips = quotas.find((q) => q.levels.includes(0)) ?? null;
  const rest = quotas.filter((q) => q !== cantrips);
  const prepared = rest.find((q) => q.pool.from) ?? null;
  const spells = prepared ? (rest.find((q) => q.quotaId === prepared.pool.from?.quotaId) ?? null) : (rest[0] ?? null);
  return { cantrips, spells, prepared };
}

export interface UsesContext {
  profBonus: number;
  mods: Record<AbilityKey, number>;
  /** Stufentabelle der Quelle — „Favored Enemy" zählt die freien Wirkungen dort. */
  column: (name: string) => string | undefined;
}

/** Freie Wirkungen einer `uses`-Option; `null` für jede andere Wirk-Art. */
export function castUses(option: CastOption, ctx: UsesContext): number | null {
  if (option.kind !== 'uses') return null;
  const count = option.count;
  if (typeof count === 'number') return count;
  if (count === 'proficiency-bonus') return ctx.profBonus;
  if ('column' in count) return firstInt(ctx.column(count.column));
  const mod = ctx.mods[abilityKeyOf(count.abilityMod) ?? 'str'] ?? 0;
  return Math.max(count.min, mod);
}

/**
 * Aufgelöste Quellen + gespeicherte Entscheidungen → der Zauber-Zustand eines Charakters.
 */
import { abilityKeyOf, type AbilityKey, type AbilityName } from '$lib/schemas/abilities';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import { castUses, quotaContext, quotaViews, type QuotaView } from './quota';
import type { CastingResolution } from './resolve';
import { spellPools, type SpellPools } from './slots';
import type { CastingIssue, CastingSource } from './source';
import { pickedKeys } from './write';

// EINE Formel für Klassen-Zauberwirken UND Merkmals-Zugänge: zwei Fassungen laufen
// auseinander, sobald eine davon angefasst wird.
export const spellSaveDC = (profBonus: number, abilityMod: number): number => 8 + profBonus + abilityMod;
export const spellAttackBonus = (profBonus: number, abilityMod: number): number => profBonus + abilityMod;

export interface PoolState {
  standard: { total: number[]; used: number[] };
  pact: { total: number[]; used: number };
}

export interface QuotaState {
  view: QuotaView;
  /** Zauber-Keys: gewährt (fester Pool) oder gespeicherte Auswahl. */
  spells: string[];
  /** Wie viele noch zu wählen sind. */
  open: number;
  uses: { max: number; used: number } | null;
}

export interface SourceState {
  source: CastingSource;
  /** null = die Wahl steht noch offen. */
  ability: AbilityName | null;
  /** Zu wählende Attribute; leer, wenn festgelegt oder beantwortet. */
  abilityOptions: AbilityName[];
  /** null, solange das Attribut offen ist. */
  saveDC: number | null;
  attackBonus: number | null;
  quotas: QuotaState[];
}

export interface SpellcastingState {
  characterLevel: number;
  pools: PoolState;
  /** true = keine Progression im Vault; nur dann zählt `manual.slotTotals`. */
  manualSlots: boolean;
  sources: SourceState[];
  /** Aus `resolve.ts` durchgereicht, dazu was `quota.ts` beim Auflösen findet. */
  issues: CastingIssue[];
  /** Zauber-Keys ohne Quelle (Homebrew). */
  extra: string[];
}

export interface SpellcastingInput {
  resolution: CastingResolution;
  stored?: CharacterSpellcasting;
  profBonus: number;
  mods: Record<AbilityKey, number>;
  /** Deklarierter Zaubername → `spell.key`, aus `resolveSpell` der Bibliothek. */
  spellKey: (name: string) => string | undefined;
}

/** `manual.slotTotals` überschreibt nur, wo es Werte trägt. */
function poolState(pools: SpellPools, stored: CharacterSpellcasting | undefined): PoolState {
  const manual = stored?.manual?.slotTotals ?? [];
  const total = pools.standard.map((n, i) => (manual[i] !== undefined ? manual[i] : n));
  const used = stored?.pools.standard.used ?? [];
  return {
    standard: { total, used: total.map((_, i) => used[i] ?? 0) },
    pact: { total: pools.pact, used: stored?.pools.pact.used ?? 0 },
  };
}

/**
 * `fixed` deckt beides ab: die Festlegung der Klasse UND die beantwortete Wahl — die trägt
 * `spellcasting/resolve.ts` aus dem Merkmals-Ledger ein. Danach bleibt der Verweis auf ein
 * anderes Merkmal, und eine einelementige Wahlliste IST eine Festlegung.
 */
function abilityOf(
  source: CastingSource,
  resolved: Map<string, AbilityName | null>,
): AbilityName | null {
  const binding = source.ability;
  if (!binding) return null;
  if (binding.fixed) return binding.fixed;
  if (binding.sameAs) return resolved.get(binding.sameAs) ?? null;
  return binding.choose.length === 1 ? binding.choose[0] : null;
}

function quotaState(view: QuotaView, stored: CharacterSpellcasting | undefined, uses: number | null): QuotaState {
  const picks = stored ? pickedKeys(stored, view.sourceId, view.quotaId) : [];
  const spells = view.fixed ? view.pool.keys : picks;
  return {
    view,
    spells,
    open: Math.max(0, view.count - spells.length),
    uses: uses === null ? null : { max: uses, used: stored?.sources[view.sourceId]?.uses[view.quotaId] ?? 0 },
  };
}

export function spellcastingState(input: SpellcastingInput): SpellcastingState {
  const { resolution, stored } = input;
  const pools = spellPools(resolution.classes);
  const progOf = new Map(resolution.classes.map((c) => [c.prog.key, c.prog]));
  const issues = [...resolution.issues];

  const abilities = new Map<string, AbilityName | null>();
  const sources: SourceState[] = [];
  for (const source of resolution.sources) {
    const prog = progOf.get(source.classKey) ?? null;
    const ctx = quotaContext(prog, source.level, pools, input.spellKey);
    const usesCtx = { profBonus: input.profBonus, mods: input.mods, column: ctx.column };
    const ability = abilityOf(source, abilities);
    abilities.set(source.id, ability);

    const quotas = quotaViews(source, ctx, issues).map((view) => {
      const option = view.cast.find((c) => c.kind === 'uses');
      return quotaState(view, stored, option ? castUses(option, usesCtx) : null);
    });
    const mod = ability ? (input.mods[abilityKeyOf(ability) ?? 'str'] ?? 0) : 0;
    sources.push({
      source,
      ability,
      abilityOptions: ability ? [] : (source.ability?.choose ?? []),
      saveDC: ability ? spellSaveDC(input.profBonus, mod) : null,
      attackBonus: ability ? spellAttackBonus(input.profBonus, mod) : null,
      quotas,
    });
  }

  return {
    characterLevel: resolution.characterLevel,
    pools: poolState(pools, stored),
    manualSlots: !pools.standard.some((n) => n > 0),
    sources,
    issues,
    extra: stored?.manual?.extra ?? [],
  };
}

/**
 * Alle Kontingente, die diesen Pool stellen: das genannte selbst und jedes, das per `into`
 * hineinlegt (Hervorrufer → Zauberbuch). Erwerb und Behälter sind zweierlei — ein Beitrag zählt
 * weiter gegen sein eigenes Kontingent, gewählt werden kann er aus dem Behälter.
 * Das genannte steht VORNE: die Anzeige hängt Beschriftung und Zeile daran.
 */
export function poolQuotas(
  state: SpellcastingState,
  target: { sourceId: string; quotaId: string },
): QuotaState[] {
  const isTarget = (ref: { sourceId: string; quotaId: string } | undefined): boolean =>
    !!ref && ref.sourceId === target.sourceId && ref.quotaId === target.quotaId;
  const all = state.sources.flatMap((s) => s.quotas.filter((q) => isTarget(q.view) || isTarget(q.view.into)));
  return all.sort((a, b) => Number(isTarget(b.view)) - Number(isTarget(a.view)));
}

/** Offene Wahlen über alle Quellen — der Rohstoff für Picker und Wahl-Plätze. */
export function openPicks(state: SpellcastingState): { sourceId: string; quotaId: string; open: number }[] {
  return state.sources
    .flatMap((s) => s.quotas.map((q) => ({ sourceId: s.source.id, quotaId: q.view.quotaId, open: q.open })))
    .filter((q) => q.open > 0);
}

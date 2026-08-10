/**
 * Aufgelöste Quellen + gespeicherte Entscheidungen → der Zauber-Zustand eines Charakters.
 */
import { abilityKeyOf, type AbilityKey, type AbilityName } from '$lib/schemas/abilities';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import type { ResolvedResource, ResourceIssue, ResourceResolution } from '../resources/resolve';
import { slotLookup } from '../resources/project';
import { castUses, quotaContext, quotaViews, type QuotaView } from './quota';
import type { CastingResolution } from './resolve';
import type { CastingIssue, CastingSource } from './source';
import { pickedKeys } from './write';

// EINE Formel für Klassen-Zauberwirken UND Merkmals-Zugänge: zwei Fassungen laufen
// auseinander, sobald eine davon angefasst wird.
export const spellSaveDC = (profBonus: number, abilityMod: number): number => 8 + profBonus + abilityMod;
export const spellAttackBonus = (profBonus: number, abilityMod: number): number => profBonus + abilityMod;


export interface QuotaState {
  view: QuotaView;
  /** Zauber-Keys: gewährt (fester Pool) oder gespeicherte Auswahl. */
  spells: string[];
  /** Wie viele noch zu wählen sind. */
  open: number;
  /** Freie Wirkungen ohne Platz; null = die Quota kennt keine. */
  uses: number | null;
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

/** Zauberpfad und Vorräte melden in EINEN Strom — der Leser ist derselbe Kasten. */
export type SheetIssue = CastingIssue | ResourceIssue;

export interface SpellcastingState {
  characterLevel: number;
  /** Die aufgelösten Vorräte; Plätze sind darin der Pool `shared: 'standard'`. */
  resources: ResolvedResource[];
  sources: SourceState[];
  /** Aus beiden `resolve.ts` durchgereicht, dazu was `quota.ts` beim Auflösen findet. */
  issues: SheetIssue[];
  /** Zauber-Keys ohne Quelle (Homebrew). */
  extra: string[];
}

export interface SpellcastingInput {
  resolution: CastingResolution;
  stored?: CharacterSpellcasting;
  profBonus: number;
  mods: Record<AbilityKey, number>;
  /** Die aufgelösten Vorräte: von dort kommen Plätze, nicht aus einer zweiten Rechnung. */
  resources: ResourceResolution;
  /** Deklarierter Zaubername → `spell.key`, aus `resolveSpell` der Bibliothek. */
  spellKey: (name: string) => string | undefined;
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
    uses,
  };
}

export function spellcastingState(input: SpellcastingInput): SpellcastingState {
  const { resolution, stored } = input;
  const slotsOf = slotLookup(input.resources.pools);
  const progOf = new Map(resolution.classes.map((c) => [c.prog.key, c.prog]));
  const issues = [...resolution.issues];

  const abilities = new Map<string, AbilityName | null>();
  const sources: SourceState[] = [];
  for (const source of resolution.sources) {
    const prog = progOf.get(source.classKey) ?? null;
    const ctx = quotaContext(prog, source.level, slotsOf, input.spellKey, input);
    const ability = abilityOf(source, abilities);
    abilities.set(source.id, ability);

    const quotas = quotaViews(source, ctx, issues).map((view) => {
      const option = view.cast.find((c) => c.kind === 'uses');
      return quotaState(view, stored, option ? castUses(option, ctx) : null);
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
    resources: input.resources.pools,
    sources,
    issues: [...issues, ...input.resources.issues],
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

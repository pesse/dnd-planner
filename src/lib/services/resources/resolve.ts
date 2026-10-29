/**
 * Vorräte eines Charakters: `grantsResource` an Merkmalen → aufgelöste Pools mit Maximum.
 * Kein Verbrauch — was am Tisch abgestrichen wird, steht auf dem gedruckten Bogen.
 */
import { abilityRecordOf, type AbilityKey } from '$lib/schemas/abilities';
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import type {
  ResourceAdjustment, ResourceDie, ResourcePool, ResourceRecharge, ResourceRef, ResourceRestore, ResourceShape,
} from '$lib/schemas/resource';
import { columnValueIn, levelTables, proficiencyBonus } from '../classProgression';
import { branchMatch, branchOf, branchValues, type BranchState } from '../declaration/branch';
import {
  declarationIssue,
  walkCarriers,
  type Carrier,
  type CarrierClass,
  type CarrierIssueKind,
  type CarrierOrigin,
  type DeclarationIssue,
  type DeclaringCharacter,
} from '../declaration/carriers';
import { itemCarriers } from '../declaration/itemCarriers';
import { levelStep, resolveAmount, type AmountContext } from './amount';
import { combineSlots, NINE, SLOT_POOL, type SlotFeeder } from './slots';

export type ResourceIssueKind =
  | CarrierIssueKind
  | 'unresolvedResourceTarget'
  | 'undeclaredCastResource'
  | 'unknownBranchKey'
  | 'unknownResourceClass'
  | 'sharedPoolKindMismatch';
export type ResourceIssue = DeclarationIssue<ResourceIssueKind>;

/** Gegenstand und Handeintrag sind Träger wie ein Merkmal — nur schreibt keiner eine Bogen-Notiz. */
export type ResourceOrigin = CarrierOrigin | 'manual';

interface ResourceCarrier extends Omit<Carrier, 'origin'> {
  origin: ResourceOrigin;
}

export interface ResourceCharacter extends DeclaringCharacter {
  /** Dasselbe Feld, aus dem der Bogen den Modifikator druckt — sonst wichen beide voneinander ab. */
  mods?: Record<AbilityKey, number>;
  inventory?: CharacterInventoryEntry[];
  /** Handeingetragene Zauberplätze — der eine Vorrat, den keine Stufentabelle hergibt. */
  spellcasting?: { manual?: { slotTotals: number[] } };
  resourceAdjustments?: ResourceAdjustment[];
}

/** Ein Zuschlag von außen — der Bogen nennt ihn, damit eine krumme Zahl erklärt ist. */
export interface ResourceAddition {
  labelDe: string;
  amount: number;
}

export interface ResolvedResource {
  /** `sourceId/poolId`; ein geteilter Pool trägt stattdessen seinen Namen. */
  id: string;
  /** Merkmals-Key des Besitzers; leer beim geteilten Pool, den mehrere Klassen speisen. */
  featureKey: string;
  labelDe: string;
  origin: ResourceOrigin;
  /** Klasse, deren Stufentabelle das Maximum speist; leer bei Trait, Talent und geteiltem Pool. */
  classKey: string;
  recharge: ResourceRecharge;
  /** 0, wo die Kurze Rast nichts zurückgibt oder ohnehin alles. */
  shortRestRegain: number;
  shared: string;
  kind: ResourceShape['kind'];
  /** `d8`; leer, wo ein Einsatz kein Würfel ist. */
  die: string;
  /** Zähler und Punkte führen einen Eintrag, Plätze neun — Index 0 = Grad 1. */
  max: number[];
  additions: ResourceAddition[];
  /** Was einen Einsatz außerhalb der Rast zurückholt, als Bogentext („Zauberplatz ab Grad 2"). */
  restoreDe: string[];
  /** Deklarierte Hinweise von Vorrat und Zuschlägen (`noteDe`). */
  notesDe: string[];
}

export interface ResourceResolution {
  pools: ResolvedResource[];
  issues: ResourceIssue[];
  characterLevel: number;
}

/** Trait und Talent haben keine Stufentabelle — dort bleibt `column` leer, statt zu melden. */
function amountContext(
  carrier: ResourceCarrier,
  classes: Map<string, CarrierClass>,
  profBonus: number,
  mods: Record<AbilityKey, number>,
): AmountContext {
  const cls = classes.get(carrier.classKey);
  const tables = levelTables(cls?.prog, carrier.origin === 'subclass' ? cls?.sub : null);
  return {
    level: carrier.level,
    profBonus,
    mods,
    column: (name) => columnValueIn(tables, name, carrier.level),
  };
}

function active(carrier: ResourceCarrier, pool: ResourcePool, state: BranchState, issues: ResourceIssue[]): boolean {
  const since = pool.since ?? (carrier.gainedAt.length ? Math.max(1, Math.min(...carrier.gainedAt)) : 1);
  if (since > carrier.level) return false;
  const match = branchMatch(pool.when, state);
  if (match.unknown)
    issues.push(declarationIssue('unknownBranchKey', carrier.key, `${pool.id}: when.${match.unknown}`));
  return match.ok;
}

const poolId = (carrier: ResourceCarrier, pool: ResourcePool): string =>
  pool.shared || `${carrier.instanceId}/${pool.id}`;

function resolveDie(die: ResourceDie | undefined, ctx: AmountContext): string {
  if (!die) return '';
  const raw = 'column' in die ? ctx.column(die.column) : levelStep(die.byLevel, ctx.level);
  return raw?.trim().match(/^d\d+$/i)?.[0].toLowerCase() ?? '';
}

/** Ein Gegenstands-Vorrat heißt nach dem Gegenstand — „Ladungen" allein trägt jeder Stab. */
function poolLabel(carrier: ResourceCarrier, pool: ResourcePool): string {
  const owner = carrier.nameDe?.trim() || carrier.name;
  const own = pool.labelDe.trim();
  if (carrier.origin === 'item') return own ? `${owner}: ${own}` : owner;
  return own || owner;
}

function ownPool(carrier: ResourceCarrier, pool: ResourcePool, max: number[], ctx: AmountContext): ResolvedResource {
  return {
    id: poolId(carrier, pool),
    featureKey: pool.shared ? '' : carrier.key,
    labelDe: poolLabel(carrier, pool),
    origin: carrier.origin,
    classKey: pool.shared ? '' : carrier.classKey,
    recharge: pool.recharge,
    shortRestRegain: pool.shortRestRegain ? resolveAmount(pool.shortRestRegain, ctx) : 0,
    shared: pool.shared,
    kind: pool.shape.kind,
    die: resolveDie(pool.die, ctx),
    max,
    additions: [],
    restoreDe: [],
    notesDe: pool.noteDe?.trim() ? [pool.noteDe.trim()] : [],
  };
}

/** `ownerKey` ist das Merkmal, an dem der Verweis STEHT — ein leeres `ref.feature` meint es. */
export function findResource(
  pools: ResolvedResource[],
  ref: ResourceRef,
  ownerKey: string,
): ResolvedResource | undefined {
  if (ref.shared.trim()) return pools.find((p) => p.shared === ref.shared.trim());
  const feature = ref.feature.trim() || ownerKey;
  return pools.find((p) => p.featureKey === feature && p.id.endsWith(`/${ref.pool}`));
}

/** Der Verweis, unter dem `findResource` diesen Vorrat wiederfindet — Merkmals-Key statt Instanz-Id. */
export function refOf(pool: ResolvedResource): ResourceRef {
  if (pool.shared) return { feature: '', pool: '', shared: pool.shared };
  return { feature: pool.featureKey, pool: pool.id.slice(pool.id.lastIndexOf('/') + 1), shared: '' };
}

const refPath = (ownerKey: string, ref: ResourceRef): string =>
  ref.shared.trim() || `${ref.feature.trim() || ownerKey}/${ref.pool}`;

/** Gleichrangige Rasten (Morgengrauen ~ lange Rast) tauschen nicht. */
const RECHARGE_RANK: Record<ResourceRecharge, number> = { 'short-rest': 0, 'long-rest': 1, dawn: 1, none: 2 };

interface PendingRestore {
  carrier: ResourceCarrier;
  pool: ResolvedResource;
  restore: ResourceRestore[];
}

function slotRestoreDe(r: Extract<ResourceRestore, { kind: 'slot' }>): string {
  if (r.pact) return 'Platz der Paktmagie';
  if (r.exactly) return `Zauberplatz des ${r.level}. Grades`;
  return r.level > 1 ? `Zauberplatz ab Grad ${r.level}` : 'Zauberplatz';
}

/** Läuft wie `applyMods` erst, wenn alle Pools stehen: das Ziel darf später deklariert sein. */
function applyRestores(pools: ResolvedResource[], pending: PendingRestore[], issues: ResourceIssue[]): void {
  for (const { carrier, pool, restore } of pending)
    for (const r of restore) {
      const target = r.kind === 'resource' ? findResource(pools, r.target, carrier.key) : undefined;
      if (r.kind === 'resource' && !target) {
        issues.push(declarationIssue('unresolvedResourceTarget', carrier.key, refPath(carrier.key, r.target)));
        continue;
      }
      const text = r.kind === 'slot' ? slotRestoreDe(r) : `${target!.labelDe} (${r.amount})`;
      if (!pool.restoreDe.includes(text)) pool.restoreDe.push(text);
    }
}

interface PendingMod {
  carrier: ResourceCarrier;
  ref: ResourceRef;
  amount: number;
  recharge?: ResourceRecharge;
  restore: ResourceRestore[];
  noteDe?: string;
}

/** Läuft erst, wenn alle Pools stehen: ein Zuschlag darf vor seinem Ziel deklariert sein. */
function applyMods(pools: ResolvedResource[], mods: PendingMod[], issues: ResourceIssue[]): PendingRestore[] {
  const restores: PendingRestore[] = [];
  for (const { carrier, ref, amount, recharge, restore, noteDe } of mods) {
    const target = findResource(pools, ref, carrier.key);
    if (!target) {
      issues.push(declarationIssue('unresolvedResourceTarget', carrier.key, refPath(carrier.key, ref)));
      continue;
    }
    if (noteDe?.trim() && !target.notesDe.includes(noteDe.trim())) target.notesDe.push(noteDe.trim());
    if (restore.length) restores.push({ carrier, pool: target, restore });
    if (recharge && RECHARGE_RANK[recharge] < RECHARGE_RANK[target.recharge]) {
      target.recharge = recharge;
      if (recharge === 'short-rest') target.shortRestRegain = 0;
    }
    if (!amount) continue;
    // Ein Zuschlag zählt am untersten Eintrag: eine weitere Anwendung, ein weiterer Platz Grad 1.
    target.max[0] = (target.max[0] ?? 0) + amount;
    target.additions.push({ labelDe: carrier.nameDe?.trim() || carrier.name, amount });
  }
  return restores;
}

/**
 * Läuft nach den Zuschlägen: ein Abschlag soll auch einen Gegenstands-Bonus aufzehren können.
 * Ein Ziel, das es nicht (mehr) gibt, wirkt nicht — der Editor zeigt es als verwaist.
 */
function applyAdjustments(pools: ResolvedResource[], adjustments: ResourceAdjustment[]): void {
  for (const adj of adjustments) {
    const target = findResource(pools, adj.target, '');
    if (!target || !adj.amount) continue;
    const slots = target.kind === 'slots';
    const i = slots ? (adj.grade ?? 1) - 1 : 0;
    if (slots) target.max = NINE(target.max);
    target.max[i] = Math.max(0, (target.max[i] ?? 0) + adj.amount);
    const reason = adj.reason.trim() || 'Anpassung';
    target.additions.push({ labelDe: slots ? `${reason} (Grad ${i + 1})` : reason, amount: adj.amount });
  }
}

/**
 * Handeingetragene Plätze überschreiben Grad für Grad und erzeugen den Pool, wo keine Klasse ihn
 * deklariert (Homebrew ohne Stufentabelle). Läuft VOR den Zuschlägen, damit ein Gegenstand auch
 * auf einen von Hand eingetragenen Vorrat wirkt.
 */
export function applyManualSlots(pools: ResolvedResource[], totals: number[]): void {
  if (!totals.some((n) => n > 0)) return;
  const existing = pools.find((p) => p.shared === SLOT_POOL && p.kind === 'slots');
  if (existing) {
    existing.max = NINE(existing.max).map((n, i) => totals[i] ?? n);
    return;
  }
  pools.push({
    id: SLOT_POOL,
    featureKey: '',
    labelDe: 'Zauberplätze',
    origin: 'manual',
    classKey: '',
    recharge: 'long-rest',
    shortRestRegain: 0,
    shared: SLOT_POOL,
    kind: 'slots',
    die: '',
    max: NINE(totals),
    additions: [],
    restoreDe: [],
    notesDe: [],
  });
}

/** `cast: {kind:'resource'}` wirkt aus dem Vorrat eines ANDEREN Merkmals (Wilder Gefährte). */
function reportCastResources(carriers: ResourceCarrier[], pools: ResolvedResource[], issues: ResourceIssue[]): void {
  for (const carrier of carriers) {
    for (const quota of carrier.grantsCasting?.quotas ?? [])
      for (const option of quota.cast) {
        if (option.kind !== 'resource') continue;
        if (option.resource && findResource(pools, option.resource, carrier.key)) continue;
        const detail = option.resource ? refPath(carrier.key, option.resource) : quota.id;
        issues.push(declarationIssue('undeclaredCastResource', carrier.key, detail));
      }
  }
}

export async function resolveResources(c: ResourceCharacter): Promise<ResourceResolution> {
  const walk = await walkCarriers(c);
  const carriers: ResourceCarrier[] = [...walk.carriers, ...(await itemCarriers(c.inventory ?? []))];
  const issues: ResourceIssue[] = [...walk.issues];
  const classes = new Map(walk.classes.map((k) => [k.prog.key, k]));
  const profBonus = proficiencyBonus(walk.characterLevel);
  const mods = c.mods ?? abilityRecordOf(() => 0);

  const pools: ResolvedResource[] = [];
  const slotFeeders = new Map<string, { pool: ResolvedResource; feeders: SlotFeeder[]; combine: 'caster-level' | 'highest' }>();
  const pending: PendingMod[] = [];
  const restores: PendingRestore[] = [];

  for (const carrier of carriers) {
    const grant = carrier.grantsResource;
    if (!grant) continue;
    const state = {
      branch: branchOf(branchValues(grant.pools.map((p) => p.when)), carrier.answers.values),
      picks: carrier.answers.picks,
    };
    const ctx = amountContext(carrier, classes, profBonus, mods);

    for (const pool of grant.pools) {
      if (!active(carrier, pool, state, issues)) continue;
      if (pool.shape.kind !== 'slots') {
        const existing = pool.shared ? pools.find((p) => p.id === pool.shared) : undefined;
        const max = resolveAmount(pool.shape.max, ctx);
        if (!existing) {
          const own = ownPool(carrier, pool, [max], ctx);
          pools.push(own);
          if (pool.restoreBy.length) restores.push({ carrier, pool: own, restore: pool.restoreBy });
        }
        else if (existing.kind === pool.shape.kind) {
          existing.max[0] += max;
          if (pool.noteDe?.trim() && !existing.notesDe.includes(pool.noteDe.trim())) existing.notesDe.push(pool.noteDe.trim());
        }
        else issues.push(declarationIssue('sharedPoolKindMismatch', carrier.key, `${pool.shared}: ${existing.kind}`));
        continue;
      }

      const cls = classes.get(carrier.classKey);
      if (!cls) {
        issues.push(declarationIssue('unknownResourceClass', carrier.key, pool.id));
        continue;
      }
      const id = poolId(carrier, pool);
      const group = slotFeeders.get(id);
      const feeder: SlotFeeder = { ...cls, levels: pool.shape.levels };
      if (group) group.feeders.push(feeder);
      else {
        const resolved = ownPool(carrier, pool, [], ctx);
        pools.push(resolved);
        slotFeeders.set(id, { pool: resolved, feeders: [feeder], combine: pool.shape.combine });
      }
    }

    for (const m of grant.mods)
      pending.push({
        carrier, ref: m.target, amount: m.addMax ? resolveAmount(m.addMax, ctx) : 0, recharge: m.recharge, restore: m.restoreBy,
        noteDe: m.noteDe,
      });
  }

  for (const { pool, feeders, combine } of slotFeeders.values()) pool.max = combineSlots(feeders, combine);
  applyManualSlots(pools, c.spellcasting?.manual?.slotTotals ?? []);
  restores.push(...applyMods(pools, pending, issues));
  applyRestores(pools, restores, issues);
  applyAdjustments(pools, c.resourceAdjustments ?? []);
  reportCastResources(carriers, pools, issues);

  return { pools, issues, characterLevel: walk.characterLevel };
}

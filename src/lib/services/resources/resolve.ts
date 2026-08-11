/**
 * Vorräte eines Charakters: `grantsResource` an Merkmalen → aufgelöste Pools mit Maximum.
 * Kein Verbrauch — was am Tisch abgestrichen wird, steht auf dem gedruckten Bogen.
 */
import { abilityRecordOf, type AbilityKey } from '$lib/schemas/abilities';
import type { CharacterInventoryEntry } from '$lib/schemas/characterSchema';
import { buildItemIndex, getItemsByDir, listItemDirs, matchItem, type ItemInfo } from '$lib/itemLibrary';
import type { ResourcePool, ResourceRecharge, ResourceRef, ResourceShape } from '$lib/schemas/resource';
import { columnValue, proficiencyBonus } from '../classProgression';
import { branchMatch, branchOf } from '../declaration/branch';
import {
  declarationIssue,
  walkCarriers,
  NO_ANSWERS,
  type Carrier,
  type CarrierClass,
  type CarrierIssueKind,
  type DeclarationIssue,
  type DeclaringCharacter,
} from '../declaration/carriers';
import type { FeatureSource } from '../declaredFeature';
import { resolveAmount, type AmountContext } from './amount';
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
export type ResourceOrigin = FeatureSource | 'item' | 'manual';

interface ResourceCarrier extends Omit<Carrier, 'origin'> {
  origin: ResourceOrigin;
}

export interface ResourceCharacter extends DeclaringCharacter {
  /** Dasselbe Feld, aus dem der Bogen den Modifikator druckt — sonst wichen beide voneinander ab. */
  mods?: Record<AbilityKey, number>;
  inventory?: CharacterInventoryEntry[];
  /** Handeingetragene Zauberplätze — der eine Vorrat, den keine Stufentabelle hergibt. */
  spellcasting?: { manual?: { slotTotals: number[] } };
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
  shared: string;
  kind: ResourceShape['kind'];
  /** Zähler und Punkte führen einen Eintrag, Plätze neun — Index 0 = Grad 1. */
  max: number[];
  additions: ResourceAddition[];
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
  const prog = classes.get(carrier.classKey)?.prog ?? null;
  return {
    level: carrier.level,
    profBonus,
    mods,
    column: (name) => (prog ? columnValue(prog, name, carrier.level) : undefined),
  };
}

function active(carrier: ResourceCarrier, pool: ResourcePool, branch: string, issues: ResourceIssue[]): boolean {
  const since = pool.since ?? (carrier.gainedAt.length ? Math.max(1, Math.min(...carrier.gainedAt)) : 1);
  if (since > carrier.level) return false;
  const match = branchMatch(pool.when, branch);
  if (match.unknown)
    issues.push(declarationIssue('unknownBranchKey', carrier.key, `${pool.id}: when.${match.unknown}`));
  return match.ok;
}

const poolId = (carrier: ResourceCarrier, pool: ResourcePool): string =>
  pool.shared || `${carrier.instanceId}/${pool.id}`;

function ownPool(carrier: ResourceCarrier, pool: ResourcePool, max: number[]): ResolvedResource {
  return {
    id: poolId(carrier, pool),
    featureKey: pool.shared ? '' : carrier.key,
    labelDe: pool.labelDe.trim() || carrier.nameDe?.trim() || carrier.name,
    origin: carrier.origin,
    classKey: pool.shared ? '' : carrier.classKey,
    recharge: pool.recharge,
    shared: pool.shared,
    kind: pool.shape.kind,
    max,
    additions: [],
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

const refPath = (ownerKey: string, ref: ResourceRef): string =>
  ref.shared.trim() || `${ref.feature.trim() || ownerKey}/${ref.pool}`;

/** Läuft erst, wenn alle Pools stehen: ein Zuschlag darf vor seinem Ziel deklariert sein. */
function applyMods(
  pools: ResolvedResource[],
  mods: { carrier: ResourceCarrier; ref: ResourceRef; amount: number }[],
  issues: ResourceIssue[],
): void {
  for (const { carrier, ref, amount } of mods) {
    const target = findResource(pools, ref, carrier.key);
    if (!target) {
      issues.push(declarationIssue('unresolvedResourceTarget', carrier.key, refPath(carrier.key, ref)));
      continue;
    }
    if (!amount) continue;
    // Ein Zuschlag zählt am untersten Eintrag: eine weitere Anwendung, ein weiterer Platz Grad 1.
    target.max[0] = (target.max[0] ?? 0) + amount;
    target.additions.push({ labelDe: carrier.nameDe?.trim() || carrier.name, amount });
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
    shared: SLOT_POOL,
    kind: 'slots',
    max: NINE(totals),
    additions: [],
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

/**
 * Ein angelegter Gegenstand ist ein Träger wie ein Merkmal — mit dem Unterschied, dass seine
 * Deklaration am Anlegen hängt: eingestimmt nur, wo der Gegenstand Einstimmung verlangt.
 */
async function itemCarriers(inventory: CharacterInventoryEntry[]): Promise<ResourceCarrier[]> {
  const worn = inventory.filter((e) => e.equipped);
  if (!worn.length) return [];

  const dirs = await listItemDirs();
  const byDir = Object.fromEntries(await Promise.all(dirs.map(async (d) => [d, await getItemsByDir(d)] as const)));
  const index = buildItemIndex(byDir);

  const out: ResourceCarrier[] = [];
  const seen = new Set<string>();
  for (const entry of worn) {
    const item: ItemInfo | undefined = matchItem(index, { sourceKey: entry.sourceKey, name: entry.name }) ?? undefined;
    if (!item?.grantsResource) continue;
    if (item.attunement && !entry.attuned) continue;
    // Zwei Zeilen desselben Gegenstands sind Buchhaltung des Inventars, kein zweiter Zuschlag —
    // sonst zählte `count: 2` anders als zwei Zeilen.
    const id = item.key ?? entry.name;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key: id,
      instanceId: id,
      name: item.name,
      nameDe: item.name_de,
      desc: '',
      gainedAt: [1],
      origin: 'item',
      level: 1,
      classKey: '',
      answers: NO_ANSWERS,
      grantsResource: item.grantsResource,
    });
  }
  return out;
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
  const pending: Parameters<typeof applyMods>[1] = [];

  for (const carrier of carriers) {
    const grant = carrier.grantsResource;
    if (!grant) continue;
    const branch = branchOf(
      grant.pools.map((p) => p.when?.option),
      carrier.answers.values,
    );
    const ctx = amountContext(carrier, classes, profBonus, mods);

    for (const pool of grant.pools) {
      if (!active(carrier, pool, branch, issues)) continue;
      if (pool.shape.kind !== 'slots') {
        const existing = pool.shared ? pools.find((p) => p.id === pool.shared) : undefined;
        const max = resolveAmount(pool.shape.max, ctx);
        if (!existing) pools.push(ownPool(carrier, pool, [max]));
        else if (existing.kind === pool.shape.kind) existing.max[0] += max;
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
        const resolved = ownPool(carrier, pool, []);
        pools.push(resolved);
        slotFeeders.set(id, { pool: resolved, feeders: [feeder], combine: pool.shape.combine });
      }
    }

    for (const m of grant.mods)
      pending.push({ carrier, ref: m.target, amount: m.addMax ? resolveAmount(m.addMax, ctx) : 0 });
  }

  for (const { pool, feeders, combine } of slotFeeders.values()) pool.max = combineSlots(feeders, combine);
  applyManualSlots(pools, c.spellcasting?.manual?.slotTotals ?? []);
  applyMods(pools, pending, issues);
  reportCastResources(carriers, pools, issues);

  return { pools, issues, characterLevel: walk.characterLevel };
}

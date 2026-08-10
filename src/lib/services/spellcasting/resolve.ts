/**
 * Die Zauber-Deklarationen aus dem gemeinsamen Träger-Durchlauf (`declaration/carriers.ts`)
 * → `CastingSource[]`; Deklarationsfehler des Vaults kommen als `issues` zurück.
 */
import { resolveClass } from '$lib/spellLibrary';
import type { AbilityBinding, CastingGrant, QuotaPatch, QuotaRef } from '$lib/schemas/casting';
import {
  NO_ANSWERS,
  originCountsClassLevel,
  walkCarriers,
  type Carrier,
  type CarrierClass,
  type DeclaringCharacter,
  type SourceAnswers,
} from '../declaration/carriers';
import { pickAnswer } from '../declaration/ledgerAnswers';
import { castingIssue, type CastingIssue, type CastingOrigin, type CastingSource, type Quota } from './source';

export type CastingCharacter = DeclaringCharacter;

export interface CastingResolution {
  /** Quellen ohne eigene Quota fehlen hier: sie wirken allein über `patches`. */
  sources: CastingSource[];
  /** Für `slots.ts` — die Progressionen sind schon geladen. */
  classes: CarrierClass[];
  issues: CastingIssue[];
  characterLevel: number;
}

export interface Placement {
  origin: CastingOrigin;
  level: number;
  classKey: string;
}

/** Vorgabe für `since`: ab welcher Stufe das Merkmal überhaupt gilt. */
const firstGain = (gainedAt: number[]): number =>
  gainedAt.length ? Math.max(1, Math.min(...gainedAt)) : 1;

/** Der einzige `when`-Schlüssel, den der Flow beantworten kann (`quota.ts::branchMatches`). */
function branchOf(quotas: Quota[], values: readonly string[]): string {
  const declared = quotas.map((q) => q.when?.option?.trim()).filter((v): v is string => !!v);
  return declared.length ? (pickAnswer(values, declared) ?? '') : '';
}

/** Eine beantwortete Attributwahl IST eine Festlegung — danach fragt niemand mehr nach. */
function bindAbility(binding: AbilityBinding | undefined, values: readonly string[]): AbilityBinding | undefined {
  if (!binding || binding.fixed || binding.choose.length < 2) return binding;
  const answer = pickAnswer(values, binding.choose);
  return answer ? { ...binding, fixed: answer } : binding;
}

/**
 * `choose-one` heißt EINE Liste je Kontingent (Eingeweihter der Magie) — fest durch die Quelle
 * des Merkmals oder beantwortet. Ohne diese Engführung bleibt `pool.lists` die volle
 * deklarierte Union, und jeder Picker bietet die ganze Bibliothek an.
 */
function bindList(quota: Quota, a: SourceAnswers): Quota {
  if (quota.pool.listMode !== 'choose-one' || quota.pool.lists.length < 2) return quota;
  const fixed = a.specialisation.trim() ? resolveClass(a.specialisation) : null;
  const list =
    (fixed && quota.pool.lists.includes(fixed) ? fixed : null) ?? pickAnswer(a.values, quota.pool.lists);
  return list ? { ...quota, pool: { ...quota.pool, lists: [list] } } : quota;
}

function toSource(carrier: Carrier, grant: CastingGrant): CastingSource {
  const since = firstGain(carrier.gainedAt);
  const a = carrier.answers;
  const quotas = grant.quotas.map((q): Quota => bindList({ ...q, since: q.since ?? since }, a));
  return {
    id: carrier.instanceId,
    featureKey: carrier.key,
    origin: carrier.origin,
    name: carrier.name,
    labelDe: carrier.nameDe?.trim() || carrier.name,
    levelRef: originCountsClassLevel(carrier.origin) ? 'class' : 'character',
    level: carrier.level,
    classKey: carrier.classKey,
    desc: carrier.desc,
    ability: bindAbility(grant.ability, a.values),
    swap: grant.swap ?? {},
    quotas,
    branch: branchOf(quotas, a.values),
  };
}

/**
 * Ad-hoc-Auflösung EINER Deklaration außerhalb der vollen Pipeline — für Aufrufer, die noch
 * keinen `CastingCharacter` haben (Merkmals-Zugang in Wizard/Aufstieg/Bogen, `spellAccess.ts`).
 * Ohne `patches`/`pool.from`/`ability.sameAs`: die trägt nur die volle Pipeline auf.
 */
export function castingSourceOf(
  f: { key?: string; name: string; nameDe?: string; desc?: string; gainedAt?: number[]; grantsCasting?: CastingGrant },
  place: Placement,
  a: SourceAnswers = NO_ANSWERS,
  id?: string,
): CastingSource | null {
  if (!f.key || !f.grantsCasting) return null;
  return toSource(
    {
      key: f.key,
      instanceId: id ?? f.key,
      name: f.name,
      nameDe: f.nameDe,
      desc: f.desc ?? '',
      gainedAt: f.gainedAt ?? [],
      origin: place.origin,
      level: place.level,
      classKey: place.classKey,
      answers: a,
    },
    f.grantsCasting,
  );
}

/** `set` ersetzt ganze Felder, auch `pool` — Zod hat dessen Vorgaben schon gefüllt. */
function applyPatches(
  sources: CastingSource[],
  patches: { featureKey: string; patch: QuotaPatch }[],
  issues: CastingIssue[],
): void {
  for (const { featureKey, patch } of patches) {
    const target = sources.find((s) => s.featureKey === patch.feature);
    const index = target?.quotas.findIndex((q) => q.id === patch.quota) ?? -1;
    if (!target || index < 0) {
      issues.push(castingIssue('unresolvedPatch', featureKey, `${patch.feature}/${patch.quota}`));
      continue;
    }
    target.quotas[index] = { ...target.quotas[index], ...patch.set };
  }
}

/** `feature` trägt danach eine QUELLEN-Id — Instanz-Zusatz inbegriffen; leer bleibt leer. */
function linkRef(
  ref: QuotaRef,
  source: CastingSource,
  sources: CastingSource[],
  idOf: Map<string, string>,
): QuotaRef | null {
  const owner = ref.feature ? sources.find((s) => s.featureKey === ref.feature) : source;
  if (!owner || !owner.quotas.some((q) => q.id === ref.quota)) return null;
  return { ...ref, feature: ref.feature ? (idOf.get(ref.feature) ?? '') : '' };
}

/** Beide Richtungen: woraus eine Quota wählt (`pool.from`) und wohin sie ablegt (`into`). */
function linkPools(sources: CastingSource[], issues: CastingIssue[]): void {
  const idOf = new Map(sources.map((s) => [s.featureKey, s.id]));
  const path = (quota: Quota, ref: QuotaRef, source: CastingSource): string =>
    `${quota.id} → ${ref.feature || source.featureKey}/${ref.quota}`;

  for (const source of sources) {
    source.quotas = source.quotas.map((quota) => {
      let next = quota;
      const from = quota.pool.from;
      if (from) {
        const linked = linkRef(from, source, sources, idOf);
        if (!linked) issues.push(castingIssue('unresolvedPool', source.featureKey, path(quota, from, source)));
        next = { ...next, pool: { ...next.pool, from: linked ?? undefined } };
      }
      const into = quota.into;
      if (into) {
        const linked = linkRef(into, source, sources, idOf);
        if (!linked) issues.push(castingIssue('unresolvedPoolTarget', source.featureKey, path(quota, into, source)));
        next = { ...next, into: linked ?? undefined };
      }
      return next;
    });
  }
}

/** „uses the same spellcasting ability you use for your Fiendish Legacy trait". */
function linkAbilities(sources: CastingSource[], issues: CastingIssue[]): void {
  const idOf = new Map(sources.map((s) => [s.featureKey, s.id]));
  for (const source of sources) {
    const sameAs = source.ability?.sameAs;
    if (!sameAs) continue;
    const id = idOf.get(sameAs);
    if (!id) {
      issues.push(castingIssue('unresolvedAbilityRef', source.featureKey, sameAs));
      source.ability = { ...source.ability!, sameAs: '' };
      continue;
    }
    source.ability = { ...source.ability!, sameAs: id };
  }
}

/** Eine Klasse, die laut `casterType` wirkt, deren Merkmale aber nichts deklarieren. */
function reportUndeclared(classes: CarrierClass[], sources: CastingSource[], issues: CastingIssue[]): void {
  for (const c of classes) {
    if (c.casterType === 'NONE') continue;
    if (sources.some((s) => s.classKey === c.prog.key)) continue;
    issues.push(castingIssue('undeclaredCasting', c.prog.key, `${c.casterType}-Zauberwirker ohne grantsCasting`));
  }
}

export async function resolveCasting(c: CastingCharacter): Promise<CastingResolution> {
  const walk = await walkCarriers(c);
  const issues: CastingIssue[] = [...walk.issues];
  const sources: CastingSource[] = [];
  const patches: { featureKey: string; patch: QuotaPatch }[] = [];

  for (const carrier of walk.carriers) {
    if (!carrier.grantsCasting) continue;
    sources.push(toSource(carrier, carrier.grantsCasting));
    for (const patch of carrier.grantsCasting.patches) patches.push({ featureKey: carrier.key, patch });
  }

  applyPatches(sources, patches, issues);
  linkPools(sources, issues);
  linkAbilities(sources, issues);
  reportUndeclared(walk.classes, sources, issues);

  return {
    sources: sources.filter((s) => s.quotas.length > 0),
    classes: walk.classes,
    issues,
    characterLevel: walk.characterLevel,
  };
}

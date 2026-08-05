/**
 * Klassen, Traits und Talente des Charakters → `CastingSource[]`; Deklarationsfehler des
 * Vaults kommen als `issues` zurück.
 */
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, matchFeatEntry } from '$lib/featsLibrary';
import type { CastingGrant, QuotaPatch } from '$lib/schemas/casting';
import type {
  CharacterBackground,
  CharacterClass,
  CharacterFeatureEntry,
  CharacterSpecies,
} from '$lib/schemas/characterSchema';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { featuresUpTo, getProgressionByKey } from '../classProgression';
import type { CastingClass } from './slots';
import {
  castingIssue,
  type CastingIssue,
  type CastingOrigin,
  type CastingSource,
  type Quota,
} from './source';

export interface CastingCharacter {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}

export interface CastingResolution {
  /** Quellen ohne eigene Quota fehlen hier: sie wirken allein über `patches`. */
  sources: CastingSource[];
  /** Für `slots.ts` — die Progressionen sind schon geladen. */
  classes: CastingClass[];
  issues: CastingIssue[];
  characterLevel: number;
}

/** Ein Merkmal, das deklariert — egal ob Klassenmerkmal, Trait oder Talent. */
interface Declaring {
  key: string;
  name: string;
  nameDe?: string;
  desc: string;
  gainedAt: number[];
  grantsCasting: CastingGrant;
}

interface Placement {
  origin: CastingOrigin;
  level: number;
  classKey: string;
}

interface Collected {
  sources: CastingSource[];
  /** Fremdverweise, erst nach der Sammlung anwendbar. */
  patches: { featureKey: string; patch: QuotaPatch }[];
}

export const characterLevel = (classes: CharacterClass[] | undefined): number =>
  Math.max(1, (classes ?? []).reduce((n, c) => n + (c.level || 0), 0));

/** Zweigwahlen stehen im Merkmals-Ledger; der erste Eintrag je Merkmal gilt. */
function branchAnswers(features: CharacterFeatureEntry[] | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of features ?? []) {
    if (!e.sourceKey || !e.choice.trim() || out.has(e.sourceKey)) continue;
    out.set(e.sourceKey, e.choice.trim());
  }
  return out;
}

/** Der erste Eintrag behält den blanken Merkmals-Key; erst die zweite Instanz trägt einen Zusatz. */
function uniqueId(key: string, used: Set<string>): string {
  if (!used.has(key)) {
    used.add(key);
    return key;
  }
  let n = 2;
  while (used.has(`${key}#${n}`)) n++;
  used.add(`${key}#${n}`);
  return `${key}#${n}`;
}

/** Vorgabe für `since`: ab welcher Stufe das Merkmal überhaupt gilt. */
const firstGain = (gainedAt: number[]): number =>
  gainedAt.length ? Math.max(1, Math.min(...gainedAt)) : 1;

function toSource(f: Declaring, place: Placement, branch: string, used: Set<string>): CastingSource {
  const since = firstGain(f.gainedAt);
  return {
    id: uniqueId(f.key, used),
    featureKey: f.key,
    origin: place.origin,
    name: f.name,
    labelDe: f.nameDe?.trim() || f.name,
    levelRef: place.origin === 'class' || place.origin === 'subclass' ? 'class' : 'character',
    level: place.level,
    classKey: place.classKey,
    desc: f.desc,
    ability: f.grantsCasting.ability,
    swap: f.grantsCasting.swap ?? {},
    quotas: f.grantsCasting.quotas.map((q): Quota => ({ ...q, since: q.since ?? since })),
    branch,
  };
}

function collect(
  features: Declaring[],
  place: Placement,
  branches: Map<string, string>,
  used: Set<string>,
  into: Collected,
): void {
  for (const f of features) {
    into.sources.push(toSource(f, place, branches.get(f.key) ?? '', used));
    for (const patch of f.grantsCasting.patches) into.patches.push({ featureKey: f.key, patch });
  }
}

const declaring = <T extends { key?: string; name: string; nameDe?: string; desc?: string; gainedAt?: number[]; grantsCasting?: CastingGrant }>(
  features: readonly T[],
): Declaring[] =>
  features
    .filter((f) => !!f.grantsCasting && !!f.key)
    .map((f) => ({
      key: f.key!,
      name: f.name,
      nameDe: f.nameDe,
      desc: f.desc ?? '',
      gainedAt: f.gainedAt ?? [],
      grantsCasting: f.grantsCasting!,
    }));

async function classCasting(
  classes: CharacterClass[],
  branches: Map<string, string>,
  used: Set<string>,
  into: Collected,
): Promise<CastingClass[]> {
  const out: CastingClass[] = [];
  for (const cls of classes) {
    if (!cls.sourceKey) continue;
    const level = cls.level || 1;
    const prog = await getProgressionByKey(cls.sourceKey);
    if (!prog) continue;
    const sub = cls.subclassKey ? await getProgressionByKey(cls.subclassKey) : null;

    // Drittel-Zauberwirker deklarieren an der Subklasse; die Stufentabelle bleibt die der Grundklasse.
    const casterType = prog.casterType !== 'NONE' ? prog.casterType : (sub?.casterType ?? 'NONE');
    out.push({ prog, level, casterType });

    const place = { level, classKey: cls.sourceKey };
    collect(declaring(featuresUpTo(prog, level)), { ...place, origin: 'class' }, branches, used, into);
    if (sub) collect(declaring(featuresUpTo(sub, level)), { ...place, origin: 'subclass' }, branches, used, into);
  }
  return out;
}

async function speciesCasting(
  species: CharacterSpecies | undefined,
  level: number,
  branches: Map<string, string>,
  used: Set<string>,
  into: Collected,
): Promise<void> {
  const keys = [species?.sourceKey, species?.subspeciesKey].filter((k): k is string => !!k?.trim());
  for (const key of keys) {
    const spec = await getSpeciesByKey(key);
    if (!spec) continue;
    collect(declaring(spec.traits), { origin: 'species', level, classKey: '' }, branches, used, into);
  }
}

/**
 * Mehrere Ledger-Einträge desselben Talents sind mehrere Quellen (Eingeweihter der Magie,
 * „a different list each time"); nur das Herkunftstalent kommt nicht zweimal.
 */
async function featCasting(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
  level: number,
  branches: Map<string, string>,
  used: Set<string>,
  into: Collected,
): Promise<void> {
  const links = (features ?? []).filter((e) => !e.choice.trim() && (e.sourceKey || e.name.trim()));
  const bg = background?.sourceKey ? await getBackgroundByKey(background.sourceKey) : null;
  const bgKey = bg?.featKey ?? '';
  const refs = [
    ...links.map((e) => ({ sourceKey: e.sourceKey, name: e.name, gainedAt: e.gainedAt ?? 1 })),
    ...(bgKey && !links.some((e) => e.sourceKey === bgKey) ? [{ sourceKey: bgKey, name: '', gainedAt: 1 }] : []),
  ];
  if (!refs.length) return;

  const lib = await getFeats();
  for (const ref of refs) {
    const entry = matchFeatEntry(lib, ref);
    if (!entry?.grantsCasting || !entry.sourceKey) continue;
    const declared: Declaring = {
      key: entry.sourceKey,
      name: entry.name,
      nameDe: entry.nameDe,
      desc: entry.desc ?? '',
      // Eine Erwerbsstufe über der Charakterstufe (Altdaten) filterte sonst alle Quotas weg.
      gainedAt: [Math.min(ref.gainedAt, level)],
      grantsCasting: entry.grantsCasting,
    };
    collect([declared], { origin: 'feat', level, classKey: '' }, branches, used, into);
  }
}

/** `set` ersetzt ganze Felder, auch `pool` — Zod hat dessen Vorgaben schon gefüllt. */
function applyPatches(sources: CastingSource[], patches: Collected['patches'], issues: CastingIssue[]): void {
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

/** `pool.from.feature` trägt danach eine QUELLEN-Id — Instanz-Zusatz inbegriffen. */
function linkPools(sources: CastingSource[], issues: CastingIssue[]): void {
  const idOf = new Map(sources.map((s) => [s.featureKey, s.id]));
  for (const source of sources) {
    source.quotas = source.quotas.map((quota) => {
      const from = quota.pool.from;
      if (!from) return quota;
      const owner = from.feature ? sources.find((s) => s.featureKey === from.feature) : source;
      if (!owner || !owner.quotas.some((q) => q.id === from.quota)) {
        issues.push(castingIssue('unresolvedPool', source.featureKey, `${quota.id} → ${from.feature || source.featureKey}/${from.quota}`));
        return { ...quota, pool: { ...quota.pool, from: undefined } };
      }
      return { ...quota, pool: { ...quota.pool, from: { ...from, feature: from.feature ? (idOf.get(from.feature) ?? '') : '' } } };
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
function reportUndeclared(classes: CastingClass[], sources: CastingSource[], issues: CastingIssue[]): void {
  for (const c of classes) {
    if (c.casterType === 'NONE') continue;
    if (sources.some((s) => s.classKey === c.prog.key)) continue;
    issues.push(castingIssue('undeclaredCasting', c.prog.key, `${c.casterType}-Zauberwirker ohne grantsCasting`));
  }
}

export async function resolveCasting(c: CastingCharacter): Promise<CastingResolution> {
  const level = characterLevel(c.classes);
  const branches = branchAnswers(c.features);
  const used = new Set<string>();
  const collected: Collected = { sources: [], patches: [] };

  const classes = await classCasting(c.classes ?? [], branches, used, collected);
  await speciesCasting(c.species, level, branches, used, collected);
  await featCasting(c.features, c.backgroundRef, level, branches, used, collected);

  const issues: CastingIssue[] = [];
  applyPatches(collected.sources, collected.patches, issues);
  linkPools(collected.sources, issues);
  linkAbilities(collected.sources, issues);
  reportUndeclared(classes, collected.sources, issues);

  return {
    sources: collected.sources.filter((s) => s.quotas.length > 0),
    classes,
    issues,
    characterLevel: level,
  };
}

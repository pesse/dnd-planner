/**
 * Klassen, Traits und Talente des Charakters → `CastingSource[]`; Deklarationsfehler des
 * Vaults kommen als `issues` zurück.
 */
import { featSpecialisation, getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, matchFeatEntry, type FeatEntry } from '$lib/featsLibrary';
import { resolveClass } from '$lib/spellLibrary';
import type { AbilityBinding, CastingGrant, QuotaPatch, QuotaRef } from '$lib/schemas/casting';
import type {
  CharacterBackground,
  CharacterClass,
  CharacterFeatureEntry,
  CharacterSpecies,
} from '$lib/schemas/characterSchema';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { featuresUpTo, getProgressionByKey } from '../classProgression';
import { ledgerAnswers, pickAnswer } from '../declaration/ledgerAnswers';
import type { CastingClass } from './slots';
import {
  castingIssue,
  type CastingIssue,
  type CastingOrigin,
  type CastingSource,
  originCountsClassLevel,
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

export interface Placement {
  origin: CastingOrigin;
  level: number;
  classKey: string;
}

interface Collected {
  sources: CastingSource[];
  /** Fremdverweise, erst nach der Sammlung anwendbar. */
  patches: { featureKey: string; patch: QuotaPatch }[];
  issues: CastingIssue[];
}

export const characterLevel = (classes: CharacterClass[] | undefined): number =>
  Math.max(1, (classes ?? []).reduce((n, c) => n + (c.level || 0), 0));

/**
 * Was der Spieler an DIESER Instanz entschieden hat, plus die Vorgabe ihrer Quelle. Beides
 * verengt die Deklaration, bevor irgendwer sie liest: `quota.ts` filtert `when.option` gegen
 * `branch`, `state.ts` liest `ability.fixed`, und der Picker liest `pool.lists`.
 */
export interface SourceAnswers {
  /** Antworten des Merkmals-Ledgers, `declaration/ledgerAnswers.ts`. */
  values: readonly string[];
  /** Vorgabe der QUELLE des Merkmals („Magic Initiate (Wizard)"), englischer Klassenname. */
  specialisation: string;
}

const NO_ANSWERS: SourceAnswers = { values: [], specialisation: '' };

/**
 * Die Id EINER Instanz: derselbe Merkmals-Key kann zweimal vergeben sein (Eingeweihter der
 * Magie ×2), und nur über die Vergabe-Stufe findet die Auflösung ihre Antwort und ihre
 * gespeicherte Auswahl wieder. Die FRÜHESTE Vergabe behält den blanken Key — sonst hinge die
 * Zuordnung an der Reihenfolge der Ledger-Einträge.
 */
export const castingSourceId = (featureKey: string, gainedAt: number, firstGainedAt: number): string =>
  gainedAt > firstGainedAt ? `${featureKey}@${gainedAt}` : featureKey;

/** Vorgabe für `since`: ab welcher Stufe das Merkmal überhaupt gilt. */
const firstGain = (gainedAt: number[]): number =>
  gainedAt.length ? Math.max(1, Math.min(...gainedAt)) : 1;

/** Altbestand ohne unterscheidbare Vergabe-Stufe: dann trennt nur noch die Position. */
function freeId(id: string, used: Set<string>): string {
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}#${n++}`;
  used.add(candidate);
  return candidate;
}

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

function toSource(
  f: Declaring,
  place: Placement,
  a: SourceAnswers,
  used: Set<string>,
  id = f.key,
): CastingSource {
  const since = firstGain(f.gainedAt);
  const quotas = f.grantsCasting.quotas.map((q): Quota => bindList({ ...q, since: q.since ?? since }, a));
  return {
    id: freeId(id, used),
    featureKey: f.key,
    origin: place.origin,
    name: f.name,
    labelDe: f.nameDe?.trim() || f.name,
    levelRef: originCountsClassLevel(place.origin) ? 'class' : 'character',
    level: place.level,
    classKey: place.classKey,
    desc: f.desc,
    ability: bindAbility(f.grantsCasting.ability, a.values),
    swap: f.grantsCasting.swap ?? {},
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
  const [declared] = declaring([f]);
  return declared ? toSource(declared, place, a, new Set(), id ?? declared.key) : null;
}

/** Die Antworten EINER Instanz; ohne Vergabe-Stufe gelten alle Einträge des Keys. */
type AnswersOf = (featureKey: string, gainedAt?: number) => SourceAnswers;

function collect(
  features: Declaring[],
  place: Placement,
  answersOf: AnswersOf,
  used: Set<string>,
  into: Collected,
): void {
  for (const f of features) {
    into.sources.push(toSource(f, place, answersOf(f.key), used));
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
  answersOf: AnswersOf,
  used: Set<string>,
  into: Collected,
): Promise<CastingClass[]> {
  const out: CastingClass[] = [];
  for (const cls of classes) {
    if (!cls.sourceKey) {
      into.issues.push(castingIssue('unlinkedClass', '', cls.name.trim()));
      continue;
    }
    const level = cls.level || 1;
    const prog = await getProgressionByKey(cls.sourceKey);
    if (!prog) {
      into.issues.push(castingIssue('unknownClassKey', '', cls.sourceKey));
      continue;
    }
    const sub = cls.subclassKey ? await getProgressionByKey(cls.subclassKey) : null;
    if (cls.subclassKey && !sub) into.issues.push(castingIssue('unknownClassKey', '', cls.subclassKey));

    // Drittel-Zauberwirker deklarieren an der Subklasse; die Stufentabelle bleibt die der Grundklasse.
    const casterType = prog.casterType !== 'NONE' ? prog.casterType : (sub?.casterType ?? 'NONE');
    out.push({ prog, level, casterType });

    const place = { level, classKey: cls.sourceKey };
    collect(declaring(featuresUpTo(prog, level)), { ...place, origin: 'class' }, answersOf, used, into);
    if (sub) collect(declaring(featuresUpTo(sub, level)), { ...place, origin: 'subclass' }, answersOf, used, into);
  }
  return out;
}

async function speciesCasting(
  species: CharacterSpecies | undefined,
  level: number,
  answersOf: AnswersOf,
  used: Set<string>,
  into: Collected,
): Promise<void> {
  const keys = [species?.sourceKey, species?.subspeciesKey].filter((k): k is string => !!k?.trim());
  for (const key of keys) {
    const spec = await getSpeciesByKey(key);
    if (!spec) continue;
    collect(declaring(spec.traits), { origin: 'species', level, classKey: '' }, answersOf, used, into);
  }
}

/** Eine Talent-Instanz am Charakter: Bibliothekseintrag, Vergabe-Stufe, Identität. */
export interface FeatInstance {
  entry: FeatEntry;
  /** Bibliotheks-Key des Talents = Merkmals-Key der Quelle. */
  featureKey: string;
  /** Vergabe-Stufe, UNGEKAPPT: sie ist Teil der Identität, kein Stufenfilter. */
  gainedAt: number;
  /** Quellen-Id samt Instanz (`castingSourceId`). */
  sourceId: string;
  /** Vorgabe des Hintergrunds, nur am Herkunftstalent. */
  specialisation: string;
}

/**
 * Die Talent-Instanzen eines Charakters, DIE eine Regel: mehrere Ledger-Links desselben
 * Talents sind mehrere Instanzen (Eingeweihter der Magie ×2, „a different list each time"),
 * das Herkunftstalent kommt aus dem Hintergrund statt aus dem Ledger — und nur einmal.
 * Aufsteigend nach Vergabe-Stufe, damit `castingSourceId` die früheste erkennt.
 */
export async function featInstances(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
): Promise<FeatInstance[]> {
  const links = (features ?? []).filter((e) => !e.choice.trim() && (e.sourceKey || e.name.trim()));
  const bg = background?.sourceKey ? await getBackgroundByKey(background.sourceKey) : null;
  const bgKey = bg?.featKey ?? '';
  const specialisation = featSpecialisation(bg);
  const refs = [
    ...links.map((e) => ({ sourceKey: e.sourceKey, name: e.name, gainedAt: e.gainedAt ?? 1 })),
    ...(bgKey && !links.some((e) => e.sourceKey === bgKey) ? [{ sourceKey: bgKey, name: '', gainedAt: 1 }] : []),
  ];
  if (!refs.length) return [];

  const lib = await getFeats();
  const resolved = refs
    .map((ref) => ({ ref, entry: matchFeatEntry(lib, ref) }))
    .filter((r): r is { ref: (typeof refs)[number]; entry: FeatEntry } => !!r.entry?.sourceKey)
    .sort((a, b) => a.ref.gainedAt - b.ref.gainedAt);

  const firstGainedAt = new Map<string, number>();
  for (const { ref, entry } of resolved)
    if (!firstGainedAt.has(entry.sourceKey!)) firstGainedAt.set(entry.sourceKey!, ref.gainedAt);

  return resolved.map(({ ref, entry }) => {
    const featureKey = entry.sourceKey!;
    return {
      entry,
      featureKey,
      gainedAt: ref.gainedAt,
      sourceId: castingSourceId(featureKey, ref.gainedAt, firstGainedAt.get(featureKey) ?? ref.gainedAt),
      specialisation: featureKey === bgKey ? specialisation : '',
    };
  });
}

/**
 * Die Id, die eine JETZT vergebene Instanz bekommt — der Bestand entscheidet, ob sie die
 * erste ist. Der Aufstieg braucht sie, bevor der Charakter das Talent trägt.
 */
export async function nextFeatSourceId(
  c: CastingCharacter,
  featureKey: string,
  gainedAt: number,
): Promise<string> {
  const instances = await featInstances(c.features, c.backgroundRef);
  const earlier = instances.filter((i) => i.featureKey === featureKey).map((i) => i.gainedAt);
  return castingSourceId(featureKey, gainedAt, Math.min(gainedAt, ...earlier));
}

async function featCasting(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
  level: number,
  answersOf: AnswersOf,
  used: Set<string>,
  into: Collected,
): Promise<void> {
  for (const inst of await featInstances(features, background)) {
    if (!inst.entry.grantsCasting) continue;
    const declared: Declaring = {
      key: inst.featureKey,
      name: inst.entry.name,
      nameDe: inst.entry.nameDe,
      desc: inst.entry.desc ?? '',
      // Eine Erwerbsstufe über der Charakterstufe (Altdaten) filterte sonst alle Quotas weg.
      gainedAt: [Math.min(inst.gainedAt, level)],
      grantsCasting: inst.entry.grantsCasting,
    };
    const answers = answersOf(inst.featureKey, inst.gainedAt);
    into.sources.push(
      toSource(declared, { origin: 'feat', level, classKey: '' }, { ...answers, specialisation: inst.specialisation }, used, inst.sourceId),
    );
    for (const patch of inst.entry.grantsCasting.patches)
      into.patches.push({ featureKey: inst.featureKey, patch });
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
function reportUndeclared(classes: CastingClass[], sources: CastingSource[], issues: CastingIssue[]): void {
  for (const c of classes) {
    if (c.casterType === 'NONE') continue;
    if (sources.some((s) => s.classKey === c.prog.key)) continue;
    issues.push(castingIssue('undeclaredCasting', c.prog.key, `${c.casterType}-Zauberwirker ohne grantsCasting`));
  }
}

export async function resolveCasting(c: CastingCharacter): Promise<CastingResolution> {
  const level = characterLevel(c.classes);
  const ledger = c.features ?? [];
  const answersOf: AnswersOf = (key, gainedAt) => ({
    values: ledgerAnswers(ledger, key, gainedAt),
    specialisation: '',
  });
  const used = new Set<string>();
  const collected: Collected = { sources: [], patches: [], issues: [] };

  const classes = await classCasting(c.classes ?? [], answersOf, used, collected);
  await speciesCasting(c.species, level, answersOf, used, collected);
  await featCasting(c.features, c.backgroundRef, level, answersOf, used, collected);

  const issues = collected.issues;
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

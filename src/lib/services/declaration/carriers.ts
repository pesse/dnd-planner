/**
 * Der EINE Durchlauf über die deklarierenden Merkmale eines Charakters — Klassen, Unterklassen,
 * Spezies, Talente. Er kennt keine Deklarationsart: wer `grantsCasting` liest und wer
 * `grantsResource`, entscheidet der Aufrufer am fertigen Träger.
 */
import type { CastingGrant } from '$lib/schemas/casting';
import type {
  CharacterBackground,
  CharacterClass,
  CharacterFeatureEntry,
  CharacterSpecies,
} from '$lib/schemas/characterSchema';
import type { ClassProgression } from '$lib/schemas/classProgression';
import type { ResourceGrant } from '$lib/schemas/resource';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { featuresUpTo, getProgressionByKey } from '../classProgression';
import type { FeatureSource } from '../declaredFeature';
import { featInstances, instanceIdOf } from './featInstances';
import { ledgerAnswers } from './ledgerAnswers';

/**
 * Deklarationsfehler des Vaults; ohne Meldung gewährt das Merkmal einfach nichts. Der Parameter
 * hält das Vokabular je Auswertung getrennt — die Form ist für alle dieselbe.
 */
export interface DeclarationIssue<K extends string = string> {
  /** Merkmals-Key der DEKLARIERENDEN Quelle; leer, wenn die Klasse selbst der Fehler ist. */
  featureKey: string;
  kind: K;
  /** Was die Meldung benennbar macht — Klassenname, Key, Pfad. */
  detail: string;
}

export const declarationIssue = <K extends string>(
  kind: K,
  featureKey: string,
  detail: string,
): DeclarationIssue<K> => ({ kind, featureKey, detail });

/** Was schon beim Einsammeln schiefgehen kann, vor jeder Deklarationsart. */
export type CarrierIssueKind = 'unlinkedClass' | 'unknownClassKey';

/** Klassen- und Subklassenmerkmale zählen nach Klassenstufe, Spezies/Talent nach Charakterstufe. */
export const originCountsClassLevel = (origin: FeatureSource): boolean =>
  origin === 'class' || origin === 'subclass';

export const characterLevel = (classes: CharacterClass[] | undefined): number =>
  Math.max(1, (classes ?? []).reduce((n, c) => n + (c.level || 0), 0));

/**
 * Was der Spieler an DIESER Instanz entschieden hat, plus die Vorgabe ihrer Quelle. Beides
 * verengt die Deklaration, bevor irgendwer sie liest.
 */
export interface SourceAnswers {
  /** Antworten des Merkmals-Ledgers (`ledgerAnswers.ts`). */
  values: readonly string[];
  /** Vorgabe der QUELLE des Merkmals („Magic Initiate (Wizard)"), englischer Klassenname. */
  specialisation: string;
}

export const NO_ANSWERS: SourceAnswers = { values: [], specialisation: '' };

export interface CarrierClass {
  prog: ClassProgression;
  level: number;
  /** Aus der Klasse — bei Drittel-Zauberwirkern aus der SUBklasse (Arkaner Ritter). */
  casterType: string;
}

/** Ein deklarierendes Merkmal an seinem Platz im Charakter. */
export interface Carrier {
  /** Merkmals-Key; die Identität, auf die jeder Fremdverweis zeigt. */
  key: string;
  /** Id DIESER Instanz — nur ein wiederholtes Talent trägt einen Zusatz (`instanceIdOf`). */
  instanceId: string;
  name: string;
  nameDe?: string;
  /** ENGLISCH — Deklarationen lesen Tabellen daraus. */
  desc: string;
  gainedAt: number[];
  origin: FeatureSource;
  /** Die maßgebliche Stufe, nach `origin` schon gewählt. */
  level: number;
  /** Klasse, deren Stufentabelle die Spalten speist; leer bei Trait und Talent. */
  classKey: string;
  answers: SourceAnswers;
  grantsCasting?: CastingGrant;
  grantsResource?: ResourceGrant;
}

export interface CarrierWalk {
  carriers: Carrier[];
  classes: CarrierClass[];
  issues: DeclarationIssue<CarrierIssueKind>[];
  characterLevel: number;
}

export interface DeclaringCharacter {
  classes?: CharacterClass[];
  species?: CharacterSpecies;
  backgroundRef?: CharacterBackground;
  features?: CharacterFeatureEntry[];
}

/** Altbestand ohne unterscheidbare Vergabe-Stufe: dann trennt nur noch die Position. */
function freeId(id: string, used: Set<string>): string {
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}#${n++}`;
  used.add(candidate);
  return candidate;
}

/** Merkmale mit Key, egal welche Deklaration sie tragen. */
interface RawFeature {
  key?: string;
  name: string;
  nameDe?: string;
  desc?: string;
  gainedAt?: number[];
  grantsCasting?: CastingGrant;
  grantsResource?: ResourceGrant;
}

const declares = (f: RawFeature): boolean => !!f.grantsCasting || !!f.grantsResource;

function toCarrier(
  f: RawFeature,
  place: { origin: FeatureSource; level: number; classKey: string },
  answers: SourceAnswers,
  instanceId: string,
): Carrier {
  return {
    key: f.key!,
    instanceId,
    name: f.name,
    nameDe: f.nameDe,
    desc: f.desc ?? '',
    gainedAt: f.gainedAt ?? [],
    origin: place.origin,
    level: place.level,
    classKey: place.classKey,
    answers,
    grantsCasting: f.grantsCasting,
    grantsResource: f.grantsResource,
  };
}

/** Die Antworten EINER Instanz; ohne Vergabe-Stufe gelten alle Einträge des Keys. */
type AnswersOf = (featureKey: string, gainedAt?: number) => SourceAnswers;

function collect(
  features: readonly RawFeature[],
  place: { origin: FeatureSource; level: number; classKey: string },
  answersOf: AnswersOf,
  used: Set<string>,
  into: Carrier[],
): void {
  for (const f of features) {
    if (!f.key || !declares(f)) continue;
    into.push(toCarrier(f, place, answersOf(f.key), freeId(f.key, used)));
  }
}

async function classCarriers(
  classes: CharacterClass[],
  answersOf: AnswersOf,
  used: Set<string>,
  into: Carrier[],
  issues: DeclarationIssue<CarrierIssueKind>[],
): Promise<CarrierClass[]> {
  // Erst alle Progressionen anstoßen, dann der Reihe nach einsammeln: die Reihenfolge von
  // `collect` bestimmt die Träger-IDs, das Laden darf trotzdem nebenläufig laufen.
  await Promise.all(
    classes.flatMap((c) => [c.sourceKey, c.subclassKey].filter((k): k is string => !!k))
      .map((k) => getProgressionByKey(k)),
  );

  const out: CarrierClass[] = [];
  for (const cls of classes) {
    if (!cls.sourceKey) {
      issues.push(declarationIssue('unlinkedClass', '', cls.name.trim()));
      continue;
    }
    const level = cls.level || 1;
    const prog = await getProgressionByKey(cls.sourceKey);
    if (!prog) {
      issues.push(declarationIssue('unknownClassKey', '', cls.sourceKey));
      continue;
    }
    const sub = cls.subclassKey ? await getProgressionByKey(cls.subclassKey) : null;
    if (cls.subclassKey && !sub) issues.push(declarationIssue('unknownClassKey', '', cls.subclassKey));

    // Drittel-Zauberwirker deklarieren an der Subklasse; die Stufentabelle bleibt die der Grundklasse.
    const casterType = prog.casterType !== 'NONE' ? prog.casterType : (sub?.casterType ?? 'NONE');
    out.push({ prog, level, casterType });

    const place = { level, classKey: cls.sourceKey };
    collect(featuresUpTo(prog, level), { ...place, origin: 'class' }, answersOf, used, into);
    if (sub) collect(featuresUpTo(sub, level), { ...place, origin: 'subclass' }, answersOf, used, into);
  }
  return out;
}

async function speciesCarriers(
  species: CharacterSpecies | undefined,
  level: number,
  answersOf: AnswersOf,
  used: Set<string>,
  into: Carrier[],
): Promise<void> {
  const keys = [species?.sourceKey, species?.subspeciesKey].filter((k): k is string => !!k?.trim());
  for (const spec of await Promise.all(keys.map(getSpeciesByKey))) {
    if (!spec) continue;
    collect(spec.traits, { origin: 'species', level, classKey: '' }, answersOf, used, into);
  }
}

async function featCarriers(
  features: CharacterFeatureEntry[] | undefined,
  background: CharacterBackground | undefined,
  level: number,
  answersOf: AnswersOf,
  used: Set<string>,
  into: Carrier[],
): Promise<void> {
  for (const inst of await featInstances(features, background)) {
    if (!declares(inst.entry)) continue;
    const answers = answersOf(inst.featureKey, inst.gainedAt);
    into.push(
      toCarrier(
        {
          ...inst.entry,
          key: inst.featureKey,
          // Eine Erwerbsstufe über der Charakterstufe (Altdaten) filterte sonst alles weg.
          gainedAt: [Math.min(inst.gainedAt, level)],
        },
        { origin: 'feat', level, classKey: '' },
        { ...answers, specialisation: inst.specialisation },
        freeId(inst.sourceId, used),
      ),
    );
  }
}

const walks = new WeakMap<DeclaringCharacter, Promise<CarrierWalk>>();

/**
 * Schlüssel ist die Objektidentität: ein Entwurf ist nach jeder Änderung ein neues Objekt, also
 * kann kein veralteter Treffer entstehen und es braucht keine Invalidierung. Ohne den Memo läuft
 * der Walk sechsmal je Charakter-Öffnen.
 *
 * `resolveCasting` und `resolveResources` kopieren `carriers`/`issues`, bevor sie sie anfassen —
 * wer das Ergebnis mutiert, braucht hier eine Kopie.
 */
export function walkCarriers(c: DeclaringCharacter): Promise<CarrierWalk> {
  const hit = walks.get(c);
  if (hit) return hit;
  const walk = runWalk(c);
  walks.set(c, walk);
  return walk;
}

async function runWalk(c: DeclaringCharacter): Promise<CarrierWalk> {
  const level = characterLevel(c.classes);
  const ledger = c.features ?? [];
  const answersOf: AnswersOf = (key, gainedAt) => ({
    values: ledgerAnswers(ledger, key, gainedAt),
    specialisation: '',
  });
  const used = new Set<string>();
  const carriers: Carrier[] = [];
  const issues: DeclarationIssue<CarrierIssueKind>[] = [];

  const classes = await classCarriers(c.classes ?? [], answersOf, used, carriers, issues);
  await speciesCarriers(c.species, level, answersOf, used, carriers);
  await featCarriers(c.features, c.backgroundRef, level, answersOf, used, carriers);

  return { carriers, classes, issues, characterLevel: level };
}

/**
 * Aufbereitung der Stufe-1-Merkmale für den Erstell-Wizard. Bewusst RUNENFREI und außerhalb
 * von `characterWizard.svelte.ts`: die Eval-Strecke läuft ohne Svelte-Compiler und müsste den
 * Aufbau sonst abschreiben — und würde vom echten Wizard-Eingang wegdriften.
 */
import { getProgressionByKey, featuresUpTo } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import type { Trait } from '$lib/schemas/species';
import { featSpecialisation, getBackgroundByKey } from '$lib/backgroundsLibrary';
import type { Background } from '$lib/schemas/background';
import { getFeats, featDesc, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
import { isFlowOwnedChoiceFeature } from '../levelUp';
import { spellAccessGrantOf, type SpellAccessGrant } from '../spellcasting/access';
import { isSpellAccessFeature } from '../declaration/casting';
import { sizeChoiceOf } from '../speciesSize';
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureClassContext, GainedFeature } from '../analysis/types';
import type { SummaryFeature } from '../aiActions/fieldSummaryAction';
import type { PerLevelFeature } from '../perLevelEffects';
import { declarationOf, declaredFeatures, type DeclaredFeature } from '../declaredFeature';
import { ABILITY_LABEL_BY_NAME } from '$lib/schemas/abilities';
import { classCastingAbility } from '../spellcasting/classOffer';

export interface FeatureBasics {
  species: { sourceKey: string; name: string };
  klass: { sourceKey: string; name: string; subclassKey?: string; subclassName?: string };
  background: { sourceKey: string; name: string };
}

export interface FeaturePrep {
  gained: GainedFeature[];
  spellAccess: SpellAccessGrant[];
  sizeChoice: AnalysisChoice | null;
  /** Erzwungene Speziesmerkmals-Wahlen stecken hier, nicht in `gained` — sonst im Klassentext. */
  speciesFeatures: GainedFeature[];
  effectFeatures: PerLevelFeature[];
  /**
   * Die eine Quelle jeder Deklarationsauswertung, bewusst UNGEFILTERT: ein Merkmal, das wegen
   * seiner Wahl aus dem KI-Eingang fällt, gewährt sein `grants` trotzdem. Gefiltert wird an
   * der Aufrufstelle nach Deklarationsart, nie nach Herkunft.
   */
  declared: DeclaredFeature[];
  summaryClass: SummaryFeature[];
  summarySpecies: SummaryFeature[];
  classContext: FeatureClassContext;
}

/**
 * `aiInterpretsRest` ist die Rückfahrkarte: das Merkmal ist aus der Analyse gefiltert, seine
 * undeklarierte Prosa braucht trotzdem eine Bogen-Zeile — im Aufstieg leistet das
 * `unredactedChoiceFeatures`, hier die Ausnahme im Filter.
 */
function level1Features(p: ClassProgression | null, source: 'class' | 'subclass'): GainedFeature[] {
  if (!p) return [];
  return featuresUpTo(p, 1)
    .filter((f) => !isFlowOwnedChoiceFeature(f) || f.aiInterpretsRest)
    .map((f) => ({
      name: f.name || f.nameDe || '',
      nameDe: f.nameDe || f.name,
      desc: f.desc || f.descDe || '',
      descDe: f.descDe,
      source,
      gainedAt: 1,
      key: f.key,
      ...declarationOf(f),
    }));
}

/**
 * Das Herkunftstalent kommt aus dem Hintergrund und nur über `gained` in die Listen — ohne
 * seine Deklaration hier wäre sie unsichtbar.
 */
function originFeat(bg: Background | null, feats: FeatEntry[]): GainedFeature | null {
  if (!bg?.featKey) return null;
  const feat = feats.find((f) => f.sourceKey === bg.featKey);
  if (!feat) return null;
  const specialisation = featSpecialisation(bg);
  return {
    name: feat.name || featDisplayName(feat),
    nameDe: featDisplayName(feat),
    desc: feat.desc || featDesc(feat),
    descDe: feat.descDe,
    source: 'feat',
    gainedAt: 1,
    key: bg.featKey,
    choice: specialisation || undefined,
    ...declarationOf(feat),
  };
}

/**
 * Aus der ROHEN Progression, weil `gained` um die flow-eigenen Wahlen beschnitten ist;
 * das Herkunftstalent steckt umgekehrt nur in `gained`.
 */
function declaredSources(
  prog: ClassProgression | null,
  sub: ClassProgression | null,
  traits: Trait[],
  gained: GainedFeature[],
): DeclaredFeature[] {
  return [
    ...declaredFeatures('class', prog ? featuresUpTo(prog, 1) : []),
    ...declaredFeatures('subclass', sub ? featuresUpTo(sub, 1) : []),
    ...declaredFeatures('species', traits),
    ...declaredFeatures('feat', gained.filter((f) => f.source === 'feat')),
  ];
}

/**
 * Aus DERSELBEN Liste wie jede andere Deklaration — der Hochelf gewährt einen Zaubertrick
 * wie ein Talent. Die Spezialisierung gilt allein dem Talent des Hintergrunds.
 */
function spellAccessGrants(declared: DeclaredFeature[], bg: Background | null): SpellAccessGrant[] {
  return declared
    .filter(isSpellAccessFeature)
    .map((f) =>
      spellAccessGrantOf(f, {
        specialisation: bg?.featKey && f.key === bg.featKey ? featSpecialisation(bg) : '',
      }),
    )
    .filter((g): g is SpellAccessGrant => g !== null);
}

function traitFeatures(traits: Trait[]): GainedFeature[] {
  return traits.map((t) => ({
    name: t.name || t.nameDe || '',
    nameDe: t.nameDe || t.name,
    desc: t.desc || t.descDe || '',
    descDe: t.descDe,
    source: 'species' as const,
    gainedAt: 1,
    key: t.key,
    ...declarationOf(t),
  }));
}

function perLevelInput(gained: GainedFeature[], speciesFeatures: GainedFeature[]): PerLevelFeature[] {
  return [...gained, ...speciesFeatures].map((f) => ({
    key: f.key ?? '',
    name: f.nameDe || f.name,
    grants: f.grants,
  }));
}

function classContextOf(klass: FeatureBasics['klass'], prog: ClassProgression | null): FeatureClassContext {
  const casterType = prog?.casterType ?? 'NONE';
  const ability = classCastingAbility(prog);
  return {
    klasseName: klass.name,
    subclassName: klass.subclassName ?? '',
    casterType,
    casterKind: casterType === 'NONE' ? 'none' : 'prepared',
    spellcastingAbility: ability ? ABILITY_LABEL_BY_NAME[ability] : '',
    toLevel: 1,
  };
}

export async function buildFeaturePrep(basics: FeatureBasics): Promise<FeaturePrep> {
  const { species, klass, background } = basics;
  const [prog, sub, spec, bg, feats] = await Promise.all([
    getProgressionByKey(klass.sourceKey),
    klass.subclassKey ? getProgressionByKey(klass.subclassKey) : Promise.resolve(null),
    getSpeciesByKey(species.sourceKey),
    getBackgroundByKey(background.sourceKey),
    getFeats(),
  ]);

  // Englisch geführt: `name`/`desc` sind kanonisch (so liest sie jeder Deutungs-Call),
  // `nameDe`/`descDe` reisen als Quelle der Übersetzungs-Calls mit.
  const gained: GainedFeature[] = [...level1Features(prog, 'class'), ...level1Features(sub, 'subclass')];
  const feat = originFeat(bg, feats);
  if (feat) gained.push(feat);

  const traits = spec?.traits ?? [];
  const declared = declaredSources(prog, sub, traits, gained);
  const spellAccess = spellAccessGrants(declared, bg);
  const speciesFeatures = traitFeatures(traits);

  const toSummary = (g: GainedFeature): SummaryFeature => ({
    name: g.name,
    nameDe: g.nameDe,
    desc: g.desc,
    source: g.source === 'subclass' ? 'class' : g.source,
    group: g.source === 'feat' ? background.name : klass.name,
    gainedAt: g.gainedAt,
    choice: g.choice,
  });

  return {
    gained,
    spellAccess,
    sizeChoice: sizeChoiceOf(spec),
    speciesFeatures,
    effectFeatures: perLevelInput(gained, speciesFeatures),
    declared,
    summaryClass: gained.map(toSummary),
    summarySpecies: speciesFeatures.map((f) => ({
      name: f.name,
      nameDe: f.nameDe,
      desc: f.desc,
      source: 'species',
      group: species.name,
    })),
    classContext: classContextOf(klass, prog),
  };
}

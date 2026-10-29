/**
 * Aufbereitung der Stufe-1-Merkmale für den Erstell-Wizard. Bewusst RUNENFREI und außerhalb
 * von `characterWizard.svelte.ts`: die Eval-Strecke läuft ohne Svelte-Compiler und müsste den
 * Aufbau sonst abschreiben — und würde vom echten Wizard-Eingang wegdriften.
 */
import { getProgressionByKey, featuresUpTo } from '../classProgression';
import { traitsUpTo } from '../traitLevel';
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
import { declarationOf, declaredFeatures, type DeclaredFeature } from '../declaredFeature';
import { ABILITY_LABEL_BY_NAME } from '$lib/schemas/abilities';
import { classCastingAbility } from '../spellcasting/classOffer';

export interface FeatureBasics {
  species: { sourceKey: string; name: string };
  klass: { sourceKey: string; name: string; subclassKey?: string; subclassName?: string };
  background: { sourceKey: string; name: string };
  /** Talent-Keys, die ein Speziesmerkmal wählen ließ (`traitFeat.ts`). */
  traitFeats?: string[];
}

export interface FeaturePrep {
  gained: GainedFeature[];
  spellAccess: SpellAccessGrant[];
  sizeChoice: AnalysisChoice | null;
  /** Erzwungene Speziesmerkmals-Wahlen stecken hier, nicht in `gained` — sonst im Klassentext. */
  speciesFeatures: GainedFeature[];
  /**
   * Die eine Quelle jeder Deklarationsauswertung, bewusst UNGEFILTERT: ein Merkmal, das wegen
   * seiner Wahl aus der Merkmalsstrecke fällt, gewährt sein `grants` trotzdem. Gefiltert wird an
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
 * Talente kommen aus Hintergrund und Speziesmerkmal und nur über `gained` in die Listen —
 * ohne ihre Deklaration hier wäre sie unsichtbar.
 */
function featGained(feats: FeatEntry[], key: string, choice = ''): GainedFeature | null {
  const feat = feats.find((f) => f.sourceKey === key);
  if (!feat) return null;
  return {
    name: feat.name || featDisplayName(feat),
    nameDe: featDisplayName(feat),
    desc: feat.desc || featDesc(feat),
    descDe: feat.descDe,
    source: 'feat',
    gainedAt: 1,
    key,
    choice: choice || undefined,
    ...declarationOf(feat),
  };
}

const originFeat = (bg: Background | null, feats: FeatEntry[]): GainedFeature | null =>
  bg?.featKey ? featGained(feats, bg.featKey, featSpecialisation(bg)) : null;

/**
 * Aus der ROHEN Progression, weil `gained` um die flow-eigenen Wahlen beschnitten ist;
 * das Herkunftstalent steckt umgekehrt nur in `gained`.
 */
function declaredSources(
  prog: ClassProgression | null,
  sub: ClassProgression | null,
  traits: Trait[],
  gained: GainedFeature[],
  bg: Background | null,
): DeclaredFeature[] {
  return [
    ...declaredFeatures('class', prog ? featuresUpTo(prog, 1) : []),
    ...declaredFeatures('subclass', sub ? featuresUpTo(sub, 1) : []),
    ...declaredFeatures('species', traits),
    ...declaredFeatures('feat', gained.filter((f) => f.source === 'feat')),
    ...declaredFeatures('background', bg?.grantsChoice?.length ? [backgroundChoiceFeature(bg)] : []),
  ];
}

/** Als Text der Vorteil, um den es geht, nicht die Hintergrundgeschichte. */
function backgroundChoiceFeature(bg: Background): Omit<DeclaredFeature, 'source'> {
  const tool = bg.benefits.find((b) => b.type === 'tool_proficiency');
  return {
    key: bg.key,
    name: bg.name,
    nameDe: bg.nameDe,
    desc: tool?.desc,
    descDe: tool?.descDe,
    grantsChoice: bg.grantsChoice,
  };
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
  for (const key of basics.traitFeats ?? []) {
    const picked = featGained(feats, key);
    if (picked) gained.push(picked);
  }

  const traits = traitsUpTo(spec?.traits ?? [], 1);
  const declared = declaredSources(prog, sub, traits, gained, bg);
  const spellAccess = spellAccessGrants(declared, bg);
  const speciesFeatures = traitFeatures(traits);

  const toSummary = (g: GainedFeature): SummaryFeature => ({
    name: g.name,
    nameDe: g.nameDe,
    desc: g.desc,
    source: g.source === 'subclass' ? 'class' : g.source,
    group: g.source !== 'feat' ? klass.name : g.key === bg?.featKey ? background.name : species.name,
    gainedAt: g.gainedAt,
    choice: g.choice,
  });

  return {
    gained,
    spellAccess,
    sizeChoice: sizeChoiceOf(spec),
    speciesFeatures,
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

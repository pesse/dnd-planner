/**
 * Aufbereitung der Stufe-1-Merkmale für die KI-Jobs des Erstell-Wizards. Bewusst RUNENFREI
 * und außerhalb von `characterWizard.svelte.ts`: die Eval-Strecke läuft ohne Svelte-Compiler
 * und müsste den Aufbau sonst abschreiben — und würde vom echten Wizard-Eingang wegdriften.
 */
import { getProgressionByKey, featuresUpTo } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import type { Trait } from '$lib/schemas/species';
import { featSpecialisation, getBackgroundByKey } from '$lib/backgroundsLibrary';
import type { Background } from '$lib/schemas/background';
import { getFeats, featDesc, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
import { isFlowOwnedChoiceFeature } from '../levelUp';
import {
  isSpellAccessFeature, spellAccessGrantOf, withoutSpellAccessFeatures, type SpellAccessGrant,
} from '../spellAccess';
import { isSheetValueTrait } from '../sheetValueTraits';
import { sizeChoiceOf } from '../speciesSize';
import type { AnalysisChoice } from '../analysis/types';
import type { FeatureClassContext, GainedFeature } from '../analysis/types';
import type { SummaryFeature } from '../aiActions/fieldSummaryAction';
import type { PerLevelFeature } from '../perLevelEffects';
import { withoutDeclaredChoiceFeatures } from '../declaration/optionList';
import { declaredFeatures, type DeclaredFeature } from '../declaredFeature';
import { withoutSpellGrantFeatures } from '../grantedSpells';
import { CASTER_ABILITY_DE, CASTER_ABILITY_KEY } from '../spellcasting';
import { keySlug } from '$lib/utils/text';

export interface FeatureBasics {
  species: { sourceKey: string; name: string };
  klass: { sourceKey: string; name: string; subclassKey?: string; subclassName?: string };
  background: { sourceKey: string; name: string };
}

export interface FeaturePrep {
  gained: GainedFeature[];
  /**
   * `gained` ohne die Merkmale, deren Wahl der Flow deterministisch führt. Getrennt, weil der
   * deutsche Merkmalstext sie weiter braucht — er entsteht aus `descDe`, nicht aus der Deutung.
   */
  analysisGained: GainedFeature[];
  spellAccess: SpellAccessGrant[];
  sizeChoice: AnalysisChoice | null;
  /** Erzwungene Speziesmerkmals-Wahlen stecken hier, nicht in `gained` — sonst im Klassentext. */
  speciesFeatures: GainedFeature[];
  /**
   * `speciesFeatures` ohne die reinen Bogenwerte und die deklarierten Wahlen. Index-gleich zu
   * `summarySpecies` bleibt `speciesFeatures`: ein deklariertes Speziesmerkmal steht mitsamt
   * seiner Wahl im Volksmerkmale-Text und braucht keine eigene Notiz-Zeile.
   */
  analysisSpeciesFeatures: GainedFeature[];
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

function level1Features(p: ClassProgression | null, source: 'class' | 'subclass'): GainedFeature[] {
  if (!p) return [];
  return featuresUpTo(p, 1)
    .filter((f) => !isFlowOwnedChoiceFeature(f))
    .map((f) => ({ name: f.name || f.nameDe || '', nameDe: f.nameDe || f.name, desc: f.desc || f.descDe || '', descDe: f.descDe, source, gainedAt: 1, key: f.key, grants: f.grants, grantsChoice: f.grantsChoice, grantsSpells: f.grantsSpells }));
}

/**
 * Das Herkunftstalent kommt aus dem Hintergrund und nur über `gained` in die Listen — ohne
 * `grantsChoice`/`grantsSpells` hier wäre seine Deklaration unsichtbar.
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
    grants: feat.grants,
    grantsChoice: feat.grantsChoice,
    grantsSpells: feat.grantsSpells,
    grantsCasting: feat.grantsCasting,
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
    source: 'species',
    gainedAt: 1,
    key: t.key,
    grants: t.grants,
    grantsChoice: t.grantsChoice,
    grantsSpells: t.grantsSpells,
  }));
}

/**
 * Was der Flow selbst abfragt, sieht die KI nicht — sonst erfindet sie eine zweite,
 * konkurrierende Wahl. Dazu fallen die reinen Bogenwerte weg: Größe und Bewegungsrate haben
 * ein eigenes Bogenfeld, ein Rider dazu wäre leeres Gerüst.
 */
function analysisSpeciesInput(speciesFeatures: GainedFeature[], traits: Trait[]): GainedFeature[] {
  const sheetValueKeys = new Set(traits.filter(isSheetValueTrait).map((t) => t.key));
  return withoutSpellGrantFeatures(
    withoutDeclaredChoiceFeatures(speciesFeatures.filter((f) => !sheetValueKeys.has(f.key ?? ''))),
  );
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
  return {
    klasseName: klass.name,
    subclassName: klass.subclassName ?? '',
    casterType,
    casterKind: casterType === 'NONE' ? 'none' : 'prepared',
    spellcastingAbility: CASTER_ABILITY_DE[CASTER_ABILITY_KEY[keySlug(klass.sourceKey)]] ?? '',
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
    analysisGained: withoutSpellGrantFeatures(withoutSpellAccessFeatures(gained, spellAccess)),
    spellAccess,
    sizeChoice: sizeChoiceOf(spec),
    speciesFeatures,
    analysisSpeciesFeatures: analysisSpeciesInput(speciesFeatures, traits),
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

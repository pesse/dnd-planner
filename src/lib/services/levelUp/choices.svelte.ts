/**
 * Die Wahl-Ketten beider Checkpoints: aus den Deklarationen der neu gewonnenen Merkmale
 * und aus der KI-Analyse entstehen die Fragen. Reine Ableitung, kein DOM und kein Laden.
 */
import { buildFeatureChoices } from './questions';
import type { ChosenFeat } from './features';
import { answerValues, hasAnswer } from './answers';
import { declaredFeatures, type DeclaredFeature } from '../declaredFeature';
import { expertiseChoice, isExpertiseFeature } from '../declaration/expertise';
import { isSpellAccessFeature } from '../declaration/casting';
import { isOptionListFeature, optionListChoices } from '../declaration/optionList';
import { characterPropertyChoices } from '../characterProperties';
import { sheetSkillProficiencies } from '../characterChoices';
import {
  spellAccessChoices, spellAccessGrantOf, spellListChoiceId, type SpellAccessGrant,
} from '../spellcasting/access';
import type { AnalysisChoice, GainedFeature } from '../analysis/types';
import type { LevelUpDelta } from '../levelUp';
import type { Character } from '../../schemas/characterSchema';
import type { LevelUpQuestion } from '../../schemas/levelUp';

export interface ChoiceSources {
  delta: LevelUpDelta | null;
  /** Nachgeladene Subklassen-Merkmale einer JETZT getroffenen Subklassen-Wahl. */
  subFeatures: GainedFeature[];
  chosenFeats: ChosenFeat[];
  /** Von der KI erkannte Wahlen — Analyse-Form (Tooltips) und Fragebogen-Form. */
  baseAnalysisChoices: AnalysisChoice[];
  featAnalysisChoices: AnalysisChoice[];
  baseChoices: LevelUpQuestion[];
  featChoices: LevelUpQuestion[];
  featAccess: SpellAccessGrant[];
  answers: Record<string, string | string[]>;
  skills: Character['skills'];
}

export function createLevelUpChoices(src: ChoiceSources) {
  /**
   * Alle Merkmale dieses Aufstiegs mit Herkunft — die eine Quelle jeder Deklaration.
   * `subFeatures` gehört dazu, weil bei einer JETZT getroffenen Subklassen-Wahl nur dort
   * Merkmale stehen (`delta.subclassFeaturesGained` ist dann leer); überschneiden können sich
   * die beiden nicht. Speziesmerkmale NICHT: ihre Wahl ist im Wizard gefallen.
   */
  const declaredSources = $derived<DeclaredFeature[]>(
    src.delta
      ? [
          ...declaredFeatures('class', src.delta.featuresGained),
          ...declaredFeatures('subclass', [...src.delta.subclassFeaturesGained, ...src.subFeatures]),
          ...declaredFeatures('feat', src.chosenFeats),
        ]
      : [],
  );
  // Der einzige Grund, weshalb die Herkunft hier zählt: die Wahl eines Talents gehört zum
  // Talent-Checkpoint, nicht zum Merkmals-Checkpoint.
  const baseDeclared = $derived(declaredSources.filter((f) => f.source !== 'feat'));
  const featDeclared = $derived(declaredSources.filter((f) => f.source === 'feat'));

  const declaredOptionFeatures = $derived(baseDeclared.filter(isOptionListFeature));
  const baseOptionAnalysis = $derived(optionListChoices(declaredOptionFeatures));

  // Die Expertise-Optionen kommen aus dem BOGEN (deutsche Schlüssel → englische SRD-Namen),
  // nicht aus dem Vault: sie sind der Übungsstand dieses Charakters.
  const sheetSkills = $derived(sheetSkillProficiencies(src.skills));
  const baseExpertiseAnalysis = $derived(
    baseDeclared
      .filter(isExpertiseFeature)
      .map((f) => expertiseChoice(f, sheetSkills.prof, sheetSkills.exp))
      .filter((c): c is AnalysisChoice => c !== null),
  );
  /**
   * Abgeleitet statt geladen wie `featAccess`: `baseDeclared` fällt direkt aus dem Delta,
   * die Talent-Seite muss erst das Nachladen abwarten.
   */
  const baseAccess = $derived(
    baseDeclared
      .filter(isSpellAccessFeature)
      .map((f) => spellAccessGrantOf(f))
      .filter((g): g is SpellAccessGrant => g !== null),
  );
  // Reaktiv: die Zauber-Wahl entsteht erst mit der beantworteten Liste — ohne deren
  // Klassenfilter böte der Picker die ganze Bibliothek an.
  const accessAnalysis = (grants: SpellAccessGrant[]) =>
    grants.flatMap((g) => spellAccessChoices(g, (src.answers[spellListChoiceId(g)] as string) ?? ''));
  const baseAccessAnalysis = $derived.by(() => accessAnalysis(baseAccess));
  const featAccessAnalysis = $derived.by(() => accessAnalysis(src.featAccess));
  // Heute ohne Vault-Fall (die Spezies steht auf Stufe 1 fest), trotzdem aus derselben Liste:
  // ein Talent, das eine Grundeigenschaft zur Wahl stellt, verlöre sie sonst still.
  const basePropertyAnalysis = $derived(characterPropertyChoices(baseDeclared));

  const baseOptionChoices = $derived(buildFeatureChoices(baseOptionAnalysis));
  const baseExpertiseChoices = $derived(buildFeatureChoices(baseExpertiseAnalysis));
  const basePropertyChoices = $derived(buildFeatureChoices(basePropertyAnalysis));
  const baseAccessChoices = $derived(buildFeatureChoices(baseAccessAnalysis));
  const featAccessChoices = $derived(buildFeatureChoices(featAccessAnalysis));

  const featDeclaredAnalysis = $derived([
    ...optionListChoices(featDeclared.filter(isOptionListFeature)),
    ...featDeclared
      .filter(isExpertiseFeature)
      .map((f) => expertiseChoice(f, sheetSkills.prof, sheetSkills.exp))
      .filter((c): c is AnalysisChoice => c !== null),
    ...characterPropertyChoices(featDeclared),
  ]);
  const featDeclaredChoices = $derived(buildFeatureChoices(featDeclaredAnalysis));

  // Beide Checkpoints zeigen beide Herkünfte: KI-erkannt und deklariert.
  const baseChoiceQs = $derived([
    ...src.baseChoices,
    ...baseOptionChoices,
    ...baseExpertiseChoices,
    ...basePropertyChoices,
    ...baseAccessChoices,
  ]);
  const featChoiceQs = $derived([...src.featChoices, ...featAccessChoices, ...featDeclaredChoices]);

  /** Nur die Analyse-Form trägt die Options-Tooltips (`optionHelpDe`), der Fragebogen nicht. */
  const analysisById = $derived.by(() => {
    const map = new Map<string, AnalysisChoice>();
    for (const c of [
      ...src.baseAnalysisChoices,
      ...src.featAnalysisChoices,
      ...baseOptionAnalysis,
      ...baseExpertiseAnalysis,
      ...basePropertyAnalysis,
      ...baseAccessAnalysis,
      ...featAccessAnalysis,
      ...featDeclaredAnalysis,
    ]) map.set(c.id, c);
    return map;
  });

  const isAnswered = (questions: LevelUpQuestion[]): boolean =>
    questions.every((q) => !q.required || hasAnswer(src.answers[q.id]));

  return {
    get declaredSources() { return declaredSources; },
    get baseDeclared() { return baseDeclared; },
    get featDeclared() { return featDeclared; },
    get declaredOptionFeatures() { return declaredOptionFeatures; },
    get baseAccess() { return baseAccess; },
    get baseOptionChoices() { return baseOptionChoices; },
    get baseExpertiseChoices() { return baseExpertiseChoices; },
    get baseAccessChoices() { return baseAccessChoices; },
    get featAccessChoices() { return featAccessChoices; },
    get baseChoiceQs() { return baseChoiceQs; },
    get featChoiceQs() { return featChoiceQs; },
    get analysisById() { return analysisById; },
    get allBaseAnswered() { return isAnswered(baseChoiceQs); },
    get allFeatAnswered() { return isAnswered(featChoiceQs); },
    isAnswered,
    /** Die KANONISCHE (englische) Antwort einer deklarierten Zweigwahl — der Options-Schlüssel. */
    optionAnswer(id: string): string {
      const q = [...baseOptionChoices, ...baseExpertiseChoices, ...basePropertyChoices, ...featDeclaredChoices]
        .find((x) => x.id === id);
      return q ? answerValues(q, src.answers[id]) : '';
    },
  };
}

export type LevelUpChoices = ReturnType<typeof createLevelUpChoices>;

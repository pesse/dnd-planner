/**
 * Die Wahl-Ketten beider Checkpoints: aus den Deklarationen der neu gewonnenen Merkmale
 * und aus der KI-Analyse entstehen die Fragen. Reine Ableitung, kein DOM und kein Laden.
 */
import { buildFeatureChoices } from './questions';
import type { ChosenFeat } from './features';
import { answerValues, hasAnswer } from './answers';
import { declaredFeatures, type DeclaredFeature } from '../declaredFeature';
import { expertiseChoice, isExpertiseFeature } from '../declaration/expertise';
import { isOptionListFeature, optionListChoices } from '../declaration/optionList';
import { characterPropertyChoices } from '../characterProperties';
import { sheetSkillProficiencies } from '../characterChoices';
import { spellAccessChoices, spellAccessGrantOf, spellListChoiceId, type SpellAccessGrant } from '../spellAccess';
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
   *
   * `subFeatures` gehört dazu, weil die Subklassen-Merkmale bei einer JETZT getroffenen
   * Subklassen-Wahl nur dort stehen (`delta.subclassFeaturesGained` ist dann leer) — sonst
   * verlöre eine Subklasse mit `optionList` ihre Wahl. Beide Quellen überschneiden sich
   * nicht: das Delta füllt die eine, der Nachlade-Pass die andere.
   *
   * Speziesmerkmale stehen NICHT hier: ein Aufstieg erlangt kein Volksmerkmal, seine Wahl ist
   * im Wizard gefallen. Sie erneut zu stellen wäre die Dublette.
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
  /**
   * Aufgeteilt auf die zwei Checkpoints — der einzige Grund, weshalb die Herkunft hier zählt:
   * die Wahl eines Talents gehört zum Talent-Schritt, nicht zum Merkmals-Schritt.
   */
  const baseDeclared = $derived(declaredSources.filter((f) => f.source !== 'feat'));
  const featDeclared = $derived(declaredSources.filter((f) => f.source === 'feat'));

  /** Deklarierte Zweigwahlen der neu gewonnenen Merkmale (Urtümlicher/Göttlicher Orden). */
  const declaredOptionFeatures = $derived(baseDeclared.filter(isOptionListFeature));
  const baseOptionAnalysis = $derived(optionListChoices(declaredOptionFeatures));

  /**
   * Deklarierte Expertise-Wahlen. Die Optionen sind der Übungsstand DIESES Charakters, also
   * kommen sie aus dem Bogen (deutsche Schlüssel → englische SRD-Namen) und nicht aus dem
   * Vault. Schon verdoppelte Fertigkeiten fallen heraus: Expertise stapelt nicht, der
   * Schurke wählt auf Stufe 6 zwei WEITERE.
   */
  const sheetSkills = $derived(sheetSkillProficiencies(src.skills));
  const baseExpertiseAnalysis = $derived(
    baseDeclared
      .filter(isExpertiseFeature)
      .map((f) => expertiseChoice(f, sheetSkills.prof, sheetSkills.exp))
      .filter((c): c is AnalysisChoice => c !== null),
  );
  /**
   * Zauber-Zugang der neu gewonnenen Merkmale — dieselbe Deklaration wie am Talent, nur an
   * einem anderen Träger. Abgeleitet statt geladen wie `featAccess`: `baseDeclared` fällt
   * direkt aus dem Delta, die Talent-Seite muss erst das Nachladen abwarten.
   */
  const baseAccess = $derived(
    baseDeclared.map((f) => spellAccessGrantOf(f)).filter((g): g is SpellAccessGrant => g !== null),
  );
  /**
   * Die Wahlen der deklarierten Zauber-Zugänge. Reaktiv, weil die Zauber-Wahlen erst mit der
   * beantworteten Liste entstehen — ohne Klassenfilter würde der Picker die ganze Bibliothek
   * anbieten.
   */
  const accessAnalysis = (grants: SpellAccessGrant[]) =>
    grants.flatMap((g) => spellAccessChoices(g, (src.answers[spellListChoiceId(g)] as string) ?? ''));
  const baseAccessAnalysis = $derived.by(() => accessAnalysis(baseAccess));
  const featAccessAnalysis = $derived.by(() => accessAnalysis(src.featAccess));
  /**
   * Deklarierte Grundeigenschaften (Größe). Am Aufstieg heute ohne Vault-Fall — die Spezies
   * steht auf Stufe 1 fest —, aber aus derselben Liste wie alles andere: ein Talent oder
   * Klassenmerkmal, das eine Eigenschaft zur Wahl stellt, verlöre sie sonst still.
   */
  const basePropertyAnalysis = $derived(characterPropertyChoices(baseDeclared));

  const baseOptionChoices = $derived(buildFeatureChoices(baseOptionAnalysis));
  const baseExpertiseChoices = $derived(buildFeatureChoices(baseExpertiseAnalysis));
  const basePropertyChoices = $derived(buildFeatureChoices(basePropertyAnalysis));
  const baseAccessChoices = $derived(buildFeatureChoices(baseAccessAnalysis));
  const featAccessChoices = $derived(buildFeatureChoices(featAccessAnalysis));

  /** Deklarierte Wahlen der gewählten Talente — dieselben Builder wie am Merkmals-Schritt. */
  const featDeclaredAnalysis = $derived([
    ...optionListChoices(featDeclared.filter(isOptionListFeature)),
    ...featDeclared
      .filter(isExpertiseFeature)
      .map((f) => expertiseChoice(f, sheetSkills.prof, sheetSkills.exp))
      .filter((c): c is AnalysisChoice => c !== null),
    ...characterPropertyChoices(featDeclared),
  ]);
  const featDeclaredChoices = $derived(buildFeatureChoices(featDeclaredAnalysis));

  /** Der Merkmals-Checkpoint zeigt beide Herkünfte: KI-erkannt und deklariert. */
  const baseChoiceQs = $derived([
    ...src.baseChoices,
    ...baseOptionChoices,
    ...baseExpertiseChoices,
    ...basePropertyChoices,
    ...baseAccessChoices,
  ]);
  /** Der Talent-Checkpoint zeigt beide Herkünfte: KI-erkannt und deklariert. */
  const featChoiceQs = $derived([...src.featChoices, ...featAccessChoices, ...featDeclaredChoices]);

  /**
   * Die Analyse-Form jeder Frage, unter ihrer id. Nur sie trägt die Options-Tooltips
   * (`optionHelpDe`), die der Fragebogen-Typ nicht kennt.
   */
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

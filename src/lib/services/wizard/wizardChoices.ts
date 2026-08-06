/**
 * Deterministische Merkmalswahlen und ihre Rider — reine Ableitungen über den Wizard-Zustand,
 * frei von `$state` und damit unverändert aus reaktiven Gettern aufrufbar.
 */
import { spellAccessChoices, spellListChoiceId, type SpellAccessGrant } from '../spellcasting/access';
import { withoutOwnedChoices } from '../declaredChoice';
import { expertiseChoices, expertiseRiders } from '../declaration/expertise';
import { languageChoices, languageRiders } from '../declaration/languages';
import { optionListChoices, optionListRiders } from '../declaration/optionList';
import { withDeclaredGrants } from '../declaration/grants';
import { characterPropertyChoices } from '../characterProperties';
import type { AnalysisChoice, ResolvedChoice } from '../analysis/types';
import type { DeclaredFeature } from '../declaredFeature';
import type { FeatureRider } from '$lib/schemas/levelUp';

/**
 * Hängt reaktiv an `declaredAnswers`: erst die beantwortete Zauberliste macht aus dem
 * Kontingent eine benutzbare Zauber-Wahl (der Bibliotheks-Filter hängt daran).
 */
export function wizardDeclaredChoices(params: {
  spellAccess: SpellAccessGrant[];
  declaredAnswers: ResolvedChoice[];
  declared: DeclaredFeature[];
  proficientSkills: string[];
  sizeChoice: AnalysisChoice | null;
}): AnalysisChoice[] {
  const { spellAccess, declaredAnswers, declared, proficientSkills, sizeChoice } = params;
  const spells = spellAccess.flatMap((grant) => {
    const answer = declaredAnswers.find((a) => a.id === spellListChoiceId(grant))?.choice ?? '';
    return spellAccessChoices(grant, answer);
  });
  // EIN Durchgang über alle Herkünfte: beide Builder liefern `null` für Merkmale des
  // jeweils anderen `kind`, ein Vorsortieren wäre ein zweiter Filter.
  const branches = optionListChoices(declared);
  // Auf Stufe 1 hat nichts Expertise — der dritte Parameter ist bewusst leer.
  const expertise = expertiseChoices(declared, proficientSkills, []);
  const languages = languageChoices(declared);
  // Deklarierte Grundeigenschaften; `sizeChoice` daneben ist der Parser-Fallback für
  // Spezies ohne Deklaration und liefert für eine redigierte nichts mehr.
  const properties = characterPropertyChoices(declared);
  return [...(sizeChoice ? [sizeChoice] : []), ...properties, ...branches, ...expertise, ...languages, ...spells];
}

/** Erzwungene Merkmalswahlen: deklarierte zuerst, dann die von der KI erkannten. */
export function wizardFeatureChoices(declaredChoices: AnalysisChoice[], analysisChoices: AnalysisChoice[]): AnalysisChoice[] {
  return [...declaredChoices, ...withoutOwnedChoices(declaredChoices, analysisChoices)];
}

/**
 * `withDeclaredGrants` liegt NUR auf den KI-Ridern: die Rider der Zweigwahlen tragen die
 * Grants der GEWÄHLTEN OPTION, die das unbedingte `grants` des Merkmals nicht ersetzen darf.
 */
export function wizardRiders(params: {
  declared: DeclaredFeature[];
  declaredAnswers: ResolvedChoice[];
  effectsRiders: FeatureRider[];
}): FeatureRider[] {
  const { declared, declaredAnswers, effectsRiders } = params;
  const answerOf = (id: string): string => declaredAnswers.find((a) => a.id === id)?.choice ?? '';
  // Stufe 1: nur die erste Zeile einer Options-Zauberliste greift (Elfenabstammung).
  const declaredRiders = optionListRiders(declared, answerOf, 1);
  const expertise = expertiseRiders(declared, answerOf);
  const languages = languageRiders(declared, answerOf);
  const ai = withDeclaredGrants(effectsRiders, declared);
  return [...ai, ...declaredRiders, ...expertise, ...languages];
}

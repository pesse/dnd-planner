/**
 * Deterministische Merkmalswahlen und ihre Rider — reine Ableitungen über den Wizard-Zustand,
 * frei von `$state` und damit unverändert aus reaktiven Gettern aufrufbar.
 */
import { spellAccessChoices, spellListChoiceId, type SpellAccessGrant } from '../spellcasting/access';
import { expertiseChoices, expertiseRiders } from '../declaration/expertise';
import { skillProficiencyChoices, skillProficiencyRiders } from '../declaration/skillProficiency';
import { languageChoices, languageRiders } from '../declaration/languages';
import { toolProficiencyChoices, toolProficiencyRiders } from '../declaration/toolProficiency';
import { abilityIncreaseChoices, abilityIncreaseRiders } from '../declaration/abilityIncrease';
import { optionListChoices, optionListRiders } from '../declaration/optionList';
import { declaredGrantRiders } from '../declaration/grants';
import { characterPropertyChoices } from '../characterProperties';
import type { AnalysisChoice } from '../analysis/types';
import type { DeclaredAnswer } from '../declaredChoice';
import type { DeclaredFeature } from '../declaredFeature';
import type { FeatureRider } from '$lib/schemas/levelUp';

/**
 * Hängt reaktiv an `declaredAnswers`: erst die beantwortete Zauberliste macht aus dem
 * Kontingent eine benutzbare Zauber-Wahl (der Bibliotheks-Filter hängt daran).
 */
export function wizardDeclaredChoices(params: {
  spellAccess: SpellAccessGrant[];
  declaredAnswers: DeclaredAnswer[];
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
  // Gegenschnitt; die andere Form (`skills.choose`) führt daneben der Fertigkeitsschritt.
  const skillProf = skillProficiencyChoices(declared, proficientSkills);
  const languages = languageChoices(declared);
  const tools = toolProficiencyChoices(declared);
  const abilities = abilityIncreaseChoices(declared);
  // Deklarierte Grundeigenschaften; `sizeChoice` daneben ist der Parser-Fallback für
  // Spezies ohne Deklaration und liefert für eine redigierte nichts mehr.
  const properties = characterPropertyChoices(declared);
  return [
    ...(sizeChoice ? [sizeChoice] : []), ...properties, ...branches, ...expertise, ...skillProf,
    ...languages, ...tools, ...abilities, ...spells,
  ];
}

/**
 * `declaredGrantRiders` steht getrennt neben den Wahl-Ridern, weil die Rider einer Zweigwahl
 * die Grants der GEWÄHLTEN OPTION tragen und das unbedingte `grants` des Merkmals nicht
 * ersetzen dürfen.
 */
export function wizardRiders(params: {
  declared: DeclaredFeature[];
  declaredAnswers: DeclaredAnswer[];
}): FeatureRider[] {
  const { declared, declaredAnswers } = params;
  const answerOf = (id: string): string => declaredAnswers.find((a) => a.id === id)?.choice ?? '';
  return [
    ...declaredGrantRiders(declared),
    // Stufe 1: nur die erste Zeile einer Options-Zauberliste greift (Elfenabstammung).
    ...optionListRiders(declared, answerOf, 1),
    ...expertiseRiders(declared, answerOf),
    ...skillProficiencyRiders(declared, answerOf),
    ...languageRiders(declared, answerOf),
    ...toolProficiencyRiders(declared, answerOf),
    ...abilityIncreaseRiders(declared, answerOf),
  ];
}

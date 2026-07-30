/**
 * Deklarierte Zweigwahl eines Merkmals (`grantsChoice.kind === 'optionList'`) — Urtümlicher
 * Orden, Göttlicher Orden und alles, was mechanisch dasselbe tut: eine im Regeltext
 * ausgeschriebene Optionsliste, bei der JEDE Option ihre Konsequenz neben sich trägt.
 *
 * Kein LLM. Wie `spellAccess.ts`/`weaponMastery.ts`/`fightingStyle.ts` die deterministische
 * Antwort auf ein geschlossenes Vokabular — und aus demselben Grund: die Optionen sind der
 * Schlüssel, gegen den die gespeicherte Antwort matcht, ein erfundenes Label bricht sie
 * still (`Wächter` statt `Warden` → die Wahl findet ihren Zweig nie wieder).
 *
 * Der eigentliche Gewinn liegt nicht im Weglassen eines Calls, sondern im Wegfall eines
 * ZUSTANDS: weil die Wirkung neben der Option steht, gibt es kein „Antwort bekannt, Wirkung
 * erst danach berechenbar" mehr — kein `determinesFurtherEffects`, kein `blocked`, keine
 * Nach-Analyse (gemessen 30–40 s je Kette, `docs/analyse-system-prompts.md` §7).
 *
 * Die Wahl entsteht als `AnalysisChoice`, die Wirkung als `FeatureRider` — dieselben zwei
 * Typen, die die KI liefert. Damit ist alles dahinter unverändert: `buildDecisions`,
 * `riderChanges`, `validateRiderSpells`, `learnInfo`.
 */
import type { AnalysisChoice } from './aiActions/featureEffectsAction';
import type { FeatureRider } from '../schemas/levelUp';
import { declaredChoice } from './declaredChoice';
import { SKILL_NAMES, type ChoiceOption, type FeatureGrant, type SkillName } from '../schemas/shared';
import { skillLabelDe } from './proficiencyGrants';

/** Was der Builder von einem Merkmal braucht — Klassenmerkmal, Trait und Talent erfüllen es. */
export interface DeclaredChoiceSource {
  key?: string;
  name: string;
  nameDe?: string;
  grantsChoice?: { kind: string; options?: ChoiceOption[]; count?: number };
}

export function isOptionListFeature(f: DeclaredChoiceSource): boolean {
  return f.grantsChoice?.kind === 'optionList' && (f.grantsChoice.options?.length ?? 0) > 0;
}

/** Die id der Wahl. Trägt den Merkmals-Key, damit zwei Zweigwahlen nie kollidieren. */
export const optionChoiceId = (f: DeclaredChoiceSource): string =>
  `optionlist_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * Die Wahl eines deklarierten Zweig-Merkmals. `determinesFurtherEffects` ist per Konstruktion
 * false — die Wirkung steht schon in der Deklaration. `isBuildDecision` ist true: eine
 * Zweigwahl ist dauerhaft und gehört ins Merkmals-Ledger.
 *
 * Deutsch kommt aus der Deklaration (`labelDe` = Zitat aus `descDe`), nicht aus einem
 * Übersetzungs-Call. Fehlt es, zeigt die Oberfläche den englischen Wert — wie bei einer
 * fehlgeschlagenen Übersetzung.
 */
export function optionListChoice(f: DeclaredChoiceSource): AnalysisChoice | null {
  if (!isOptionListFeature(f)) return null;
  const options = f.grantsChoice!.options!;
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: optionChoiceId(f), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    question: `${f.name}: choose one`,
    questionDe: `${nameDe}: Wähle eine Option`,
    options: options.map((o) => o.value),
    optionsDe: options.map((o) => o.labelDe || o.value),
    optionHelp: {},
    optionHelpDe: Object.fromEntries(options.filter((o) => o.helpDe.trim()).map((o) => [o.value, o.helpDe])),
  };
}

/** Alle deklarierten Zweigwahlen einer Merkmalsliste, in Eingangsreihenfolge. */
export function optionListChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features.map(optionListChoice).filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Merkmale OHNE die, deren Zweigwahl der Flow deterministisch führt — der KI-Eingang.
 * EINE Regel für Wizard und Aufstieg, aus demselben Grund wie bei
 * `withoutSpellAccessFeatures`: ein zweiter Filter liefe auseinander und das Merkmal würde
 * auf einem der beiden Wege doppelt gefragt.
 */
export function withoutOptionListFeatures<T extends DeclaredChoiceSource>(features: T[]): T[] {
  return features.filter((f) => !isOptionListFeature(f));
}

/** Die gewählte Option, gematcht über den kanonischen (englischen) Wert. */
export function chosenOption(f: DeclaredChoiceSource, answer: string): ChoiceOption | null {
  if (!isOptionListFeature(f)) return null;
  const want = answer.trim();
  return f.grantsChoice!.options!.find((o) => o.value === want) ?? null;
}

/**
 * Die Wirkung der getroffenen Wahl als `FeatureRider` — leer, solange nichts gewählt ist
 * oder die Option nichts gewährt.
 *
 * `sheetNote` bleibt LEER: die Notiz ist noch KI-Arbeit (Pass C sieht sie über
 * `<past_choices>`), und eine hier erfundene deutsche Zeile stünde neben der englischen des
 * Modells. `decisions` bleibt ebenfalls leer — die Wahl protokolliert
 * `featureChoiceChanges` aus dem Fragebogen, ein zweiter Eintrag wäre eine Dublette.
 */
export function optionListRider(f: DeclaredChoiceSource, answer: string): FeatureRider | null {
  const option = chosenOption(f, answer);
  const grants = option?.grants;
  if (!grants || isEmptyFeatureGrant(grants)) return null;
  return {
    ...emptyRider(f),
    extraCantrips: grants.extraCantrips,
    extraPreparedCount: grants.extraPreparedCount,
    proficiencies: {
      skills: [...grants.proficiencies.skills.fixed],
      tools: [],
      weapons: [...grants.proficiencies.weapons],
      armor: [...grants.proficiencies.armor],
      languages: [],
      savingThrows: [...grants.proficiencies.savingThrows],
    },
  };
}

/**
 * Rider-Gerüst eines deklarierten Merkmals: alles leer bis auf die Identität.
 *
 * `sheetNote` bleibt leer und `decisions` ebenso — beides ist bewusst: die Bogen-Zeile
 * kommt aus `optionListNoteLines`, das Protokoll aus `featureChoiceChanges`. Ein Eintrag
 * hier wäre jeweils die zweite Ausfertigung.
 */
function emptyRider(f: DeclaredChoiceSource): FeatureRider {
  return {
    featureName: f.name,
    featureKey: f.key ?? '',
    source: 'class',
    grantedSpells: [],
    extraCantrips: 0,
    extraPreparedCount: 0,
    expertiseSkills: [],
    proficiencies: { skills: [], tools: [], weapons: [], armor: [], languages: [], savingThrows: [] },
    abilityScoreIncrease: { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
    decisions: [],
    sheetNote: '',
  };
}

/** Rider aller beantworteten Zweigwahlen einer Merkmalsliste. */
export function optionListRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): FeatureRider[] {
  return features
    .map((f) => optionListRider(f, answerOf(optionChoiceId(f))))
    .filter((r): r is FeatureRider => r !== null);
}

// ── Expertise (kind: 'expertise') ────────────────────────────────────────────────
//
// Der einzige `kind`, dessen Optionen NICHT im Vault stehen können: „Expertise in zwei
// deiner Fertigkeitsübungen deiner Wahl" heißt, die Liste ist der Übungsstand dieses
// Charakters. Deklariert wird nur die Anzahl.
//
// Genau darum konnte die KI hier nie liefern: `buildFeatureEffectsInput` schickt bewusst
// keine Charakter-Zusammenfassung mit (Attribute/Slots wären Token-Ballast), das Modell
// kennt die geübten Fertigkeiten also nicht — es konnte nur eine Auswahlliste erfinden.

export function isExpertiseFeature(f: DeclaredChoiceSource): boolean {
  return f.grantsChoice?.kind === 'expertise';
}

export const expertiseChoiceId = (f: DeclaredChoiceSource): string =>
  `expertise_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * Die Expertise-Wahl: `count` aus den geübten Fertigkeiten, die noch keine Expertise haben.
 * Ohne geübte Fertigkeit gibt es keine Wahl (statt einer leeren Liste) — das passiert nur
 * bei kaputten Altdaten, und eine unbeantwortbare Frage würde den Checkpoint blockieren.
 *
 * `already` fällt heraus, weil Expertise nicht stapelbar ist: der Schurke wählt auf Stufe 6
 * zwei WEITERE, nicht dieselben.
 */
export function expertiseChoice(
  f: DeclaredChoiceSource,
  proficient: readonly string[],
  already: readonly string[] = [],
): AnalysisChoice | null {
  if (!isExpertiseFeature(f)) return null;
  const taken = new Set(already);
  const options = proficient.filter((s) => !taken.has(s));
  if (!options.length) return null;
  const count = Math.max(1, f.grantsChoice!.count ?? 1);
  const nameDe = f.nameDe || f.name;
  return {
    ...declaredChoice({ id: expertiseChoiceId(f), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    type: 'multiselect',
    max: Math.min(count, options.length),
    question: `${f.name}: choose ${count} of your skill proficiencies`,
    questionDe: `${nameDe}: Wähle ${count} deiner geübten Fertigkeiten`,
    helpDe: 'Der Übungsbonus zählt in diesen Fertigkeiten doppelt.',
    options: [...options],
    optionsDe: options.map(skillLabelDe),
  };
}

/** Rider der getroffenen Expertise-Wahl (englische SRD-Namen — das Vokabular des Riders). */
export function expertiseRider(f: DeclaredChoiceSource, picked: readonly string[]): FeatureRider | null {
  const skills = picked.filter((s): s is SkillName => (SKILL_NAMES as readonly string[]).includes(s));
  if (!isExpertiseFeature(f) || !skills.length) return null;
  return { ...emptyRider(f), expertiseSkills: [...skills] };
}

/**
 * Die Bogen-Zeile einer getroffenen Zweigwahl, deutsch, aus der Deklaration.
 *
 * Nötig aus demselben Grund wie `spellAccessNoteLines`: das Merkmal steht nicht mehr im
 * KI-Eingang, also schreibt Pass C keine `sheetNote` mehr dafür — ohne diese Zeile stünde
 * die getroffene Wahl nirgends auf dem Bogen. Und hier zahlt sich `labelDe`/`helpDe` aus:
 * die Zeile ist ein Zitat plus eine redigierte Konsequenz, keine Übersetzung zur Laufzeit.
 */
export function optionListNoteLines(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): string[] {
  const lines: string[] = [];
  for (const f of features) {
    const option = chosenOption(f, answerOf(optionChoiceId(f)));
    if (!option) continue;
    const label = option.labelDe || option.value;
    const help = option.helpDe.trim();
    lines.push(`${f.nameDe || f.name}: ${label}${help ? ` — ${help}` : ''}`);
  }
  return lines;
}

/** Ob eine Deklaration überhaupt etwas gewährt (sonst braucht sie keinen Rider). */
export function isEmptyFeatureGrant(g: FeatureGrant): boolean {
  const p = g.proficiencies;
  return (
    !g.extraCantrips &&
    !g.extraPreparedCount &&
    !g.perLevel.hpMax &&
    !p.skills.fixed.length &&
    !p.skills.choose &&
    !p.savingThrows.length &&
    !p.weapons.length &&
    !p.weaponsOther.length &&
    !p.armor.length
  );
}

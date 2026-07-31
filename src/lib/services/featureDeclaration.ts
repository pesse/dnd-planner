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
 * Nach-Analyse (gemessen 30–40 s je Kette, `docs/analysis/analyse-system-prompts.md` §7).
 *
 * Die Wahl entsteht als `AnalysisChoice`, die Wirkung als `FeatureRider` — dieselben zwei
 * Typen, die die KI liefert. Damit ist alles dahinter unverändert: `buildDecisions`,
 * `riderChanges`, `validateRiderSpells`, `learnInfo`.
 *
 * Dazu die beiden weiteren Deklarationen, die dieselben Typen füllen: `expertise` (Optionen aus
 * dem Übungsstand des Charakters) und das unbedingte `grants` am Merkmal selbst
 * (`withDeclaredGrants` — das einzige, das den KI-Rider nicht ersetzt, sondern überstimmt).
 */
import type { AnalysisChoice } from './aiActions/featureEffectsAction';
import type { Change, FeatureRider } from '../schemas/levelUp';
import { declaredChoice } from './declaredChoice';
import {
  SKILL_NAMES,
  type ChoiceOption,
  type FeatureChoiceGrant,
  type FeatureGrant,
  type SkillName,
} from '../schemas/shared';
import { proficiencyGrantChanges, skillLabelDe } from './proficiencyGrants';
import {
  characterPropertyChanges,
  isCharacterPropertyFeature,
  isEmptyCharacterProperties,
} from './characterProperties';
import type { FeatureSource } from './declaredFeature';
import { featureIdOf } from '$lib/utils/text';

/** Was der Builder von einem Merkmal braucht — Klassenmerkmal, Trait und Talent erfüllen es. */
export interface DeclaredChoiceSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  grantsChoice?: FeatureChoiceGrant;
}

/** Ein Merkmal, dessen Deklaration feststeht — spart die Nicht-Null-Behauptungen dahinter. */
type Declared = DeclaredChoiceSource & { grantsChoice: FeatureChoiceGrant };

export function isOptionListFeature(f: DeclaredChoiceSource): f is Declared {
  return f.grantsChoice?.kind === 'optionList' && f.grantsChoice.options.length > 0;
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
  const options = f.grantsChoice.options;
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
 * Ob das Merkmal überhaupt eine Wahl DEKLARIERT — herkunftsfrei, denn jeder `kind` ist per
 * Definition flow-eigen: die Optionen kommen aus der Bibliothek, nie aus dem Modell.
 */
export const isFlowOwnedDeclaration = (f: DeclaredChoiceSource): boolean => !!f.grantsChoice;

/** Ob der Flow die Wahl dieses Merkmals selbst führt — `optionList`, `expertise` oder Eigenschaft. */
export function isDeclaredChoiceFeature(f: DeclaredChoiceSource): boolean {
  return isOptionListFeature(f) || isExpertiseFeature(f) || isCharacterPropertyFeature(f);
}

/**
 * Merkmale OHNE die, deren Wahl der Flow deterministisch führt — der KI-Eingang.
 * EINE Regel für Wizard und Aufstieg, aus demselben Grund wie bei
 * `withoutSpellAccessFeatures`: ein zweiter Filter liefe auseinander und das Merkmal würde
 * auf einem der beiden Wege doppelt gefragt.
 *
 * Für Klassenmerkmale des Aufstiegs erledigt das schon `isFlowOwnedChoiceFeature`
 * (services/levelUp.ts). Dieser Filter deckt die beiden Wege, die dort NICHT durchlaufen:
 * Speziesmerkmale (der Wizard hat für sie kein Sieb) und die nach der Subklassen-Wahl
 * nachgeladenen Subklassen-Merkmale (`computeSubclassFeatures`).
 */
export function withoutDeclaredChoiceFeatures<T extends DeclaredChoiceSource>(features: T[]): T[] {
  return features.filter((f) => !isDeclaredChoiceFeature(f));
}

/**
 * Merkmale, deren WAHL deklariert ist, deren WIRKUNG aber nicht — mit der getroffenen Antwort
 * als `choice`.
 *
 * Sie gehören in den Eingang von Pass C, nicht in den der Analyse: dort würde das Modell
 * dieselbe Frage ein zweites Mal stellen. Nach dem Checkpoint steht die Antwort, und der
 * Prompt behandelt `choice` als FINAL — damit deutet die KI genau das, was die Deklaration
 * nicht ausdrücken kann (Elfenabstammung: „Reichweite deiner Dunkelsicht erhöht sich auf
 * 36 Meter", eine Mechanik, für die `featureGrant` kein Feld hat).
 *
 * Der Diskriminator ist derselbe wie an jeder Deklaration: `options[].grants` FEHLT = nie
 * redigiert, also deutet die KI. `{}` = geprüft, gewährt nichts — dann gibt es nichts zu
 * deuten und das Merkmal bleibt draußen. Ohne diese Unterscheidung zöge jede reine Zweigwahl
 * (Urtümlicher Orden) den KI-Call zurück, den die Deklaration gerade eingespart hat.
 *
 * Nur `optionList`: bei `expertise` IST die Wahl der ganze Inhalt.
 */
export function unredactedChoiceFeatures<T extends DeclaredChoiceSource & { choice?: string }>(
  features: T[],
  answerOf: (f: DeclaredChoiceSource) => string,
): (T & { choice: string })[] {
  const out: (T & { choice: string })[] = [];
  for (const f of features) {
    if (!isOptionListFeature(f)) continue;
    const answer = answerOf(f);
    const option = chosenOption(f, answer);
    if (!option || option.grants) continue;
    out.push({ ...f, choice: answer });
  }
  return out;
}

/** Die gewählte Option, gematcht über den kanonischen (englischen) Wert. */
export function chosenOption(f: DeclaredChoiceSource, answer: string): ChoiceOption | null {
  if (!isOptionListFeature(f)) return null;
  const want = answer.trim();
  return f.grantsChoice.options.find((o) => o.value === want) ?? null;
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
export function optionListRider(f: DeclaredChoiceSource, answer: string, level: number): FeatureRider | null {
  const option = chosenOption(f, answer);
  if (!option) return null;
  const spells = optionSpellsUpTo(option, level);
  const grants = option.grants;
  const declaresGrant = !!grants && !isEmptyFeatureGrant(grants);
  if (!declaresGrant && !spells.length) return null;
  const base: FeatureRider = { ...emptyRider(f), grantedSpells: spells };
  return declaresGrant ? withGrant(base, grants) : base;
}

/**
 * Die Zauber einer Option bis `level` — kumulativ wie die Stufentabelle („für deine Stufe und
 * niedriger", `declaredSpellGrants`). Höhere Zeilen kommen beim Aufstieg dazu, deshalb liest
 * `optionSpellNames` sie später über die GESPEICHERTE Antwort noch einmal.
 */
function optionSpellsUpTo(option: ChoiceOption, level: number): string[] {
  const out: string[] = [];
  for (const row of option.spells) {
    if (row.level > level) continue;
    for (const name of row.names) if (name.trim() && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Die Zauber der bereits GEWÄHLTEN Option auf `level` — der Weg für Zeilen, die erst später
 * greifen (Elfenabstammung Stufe 3 und 5). Die Antwort steht am Charakter, nicht im Fragebogen:
 * ein Aufstieg stellt die Wahl der Erschaffung nicht erneut.
 */
export function optionSpellNames(
  features: DeclaredChoiceSource[],
  answerOf: (f: DeclaredChoiceSource) => string,
  level: number,
): string[] {
  const out: string[] = [];
  for (const f of features) {
    const option = chosenOption(f, answerOf(f));
    if (!option) continue;
    for (const name of optionSpellsUpTo(option, level)) if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Rider-Gerüst eines deklarierten Merkmals: alles leer bis auf die Identität.
 *
 * `sheetNote` bleibt leer und `decisions` ebenso — beides ist bewusst: die Bogen-Zeile
 * kommt aus `optionListNoteLines`, das Protokoll aus `featureChoiceChanges`. Ein Eintrag
 * hier wäre jeweils die zweite Ausfertigung.
 */
function emptyRider(f: { key?: string; name: string; source?: FeatureSource }): FeatureRider {
  return {
    featureName: f.name,
    featureKey: f.key ?? '',
    // Aus dem Merkmal, nicht pauschal 'class': ein Talent- oder Speziesmerkmals-Rider war
    // sonst falsch etikettiert (unsichtbar, weil das Feld einen Default hat).
    source: f.source ?? 'class',
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

/** Rider aller beantworteten Zweigwahlen einer Merkmalsliste. `level` gilt für `options[].spells`. */
export function optionListRiders(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
  level: number,
): FeatureRider[] {
  return features
    .map((f) => optionListRider(f, answerOf(optionChoiceId(f)), level))
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

export function isExpertiseFeature(f: DeclaredChoiceSource): f is Declared {
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
  const count = Math.max(1, f.grantsChoice.count);
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

/**
 * Was eine Deklaration gewährt, das der Rider nicht ausdrücken kann — heute nur die
 * EINGESCHRÄNKTE Waffen-Übung („Martial weapons that have the Light property"): Freitext,
 * für den es im geschlossenen Rider-Vokabular kein Feld gibt und geben soll (Pass C nennt
 * sie ausdrücklich Text, nicht Grant).
 *
 * Alles Übrige reist über `withGrant` in den Rider und von dort über `riderGrantChanges`;
 * deshalb die Ausschlussliste. Ohne diese Funktion wäre `grants.proficiencies.weaponsOther`
 * deklarierbar, aber im Aufstieg wirkungslos — dieselbe stille Lücke wie zuvor bei den
 * Waffen- und Rüstungsübungen.
 */
export function declaredGrantChanges(
  features: readonly DeclaredGrantSource[],
  meta: { step: string; source: string },
): Change[] {
  const out: Change[] = [];
  // Dasselbe Merkmal erreicht den Aufstieg aus mehreren Richtungen (Delta und nachgeladene
  // Subklassen-Merkmale) — sonst stünde seine Zeile zweimal im Protokoll.
  const seen = new Set<string>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    const id = featureIdOf(f);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = { ...meta, source: f.key || meta.source };
    out.push(
      ...proficiencyGrantChanges(f.grants.proficiencies, source, ['skills', 'savingThrows', 'weapons', 'armor']),
      // Grundeigenschaften stehen NICHT in der Ausschlussliste: sie reisen nie über den
      // Rider, dieser Weg ist ihr einziger.
      ...characterPropertyChanges(f.grants.properties, source),
    );
  }
  return out;
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
    !p.armor.length &&
    isEmptyCharacterProperties(g.properties)
  );
}

// ── Unbedingte Deklaration (`grants` am Merkmal selbst) ──────────────────────────
//
// Die einzige der drei Deklarationen, die das Merkmal NICHT aus dem KI-Eingang nimmt: es trägt
// weiter Prosa, für die Pass C eine `sheetNote` schreiben soll (Stufe 5 ist offen). Also sieht
// das Modell dasselbe Merkmal und liefert dafür einen eigenen Rider — ohne Auflösung zählte ein
// deklariertes `extraCantrips` zweimal.

/** Ein Merkmal mit unbedingter Deklaration — Klassenmerkmal, Trait und Talent erfüllen es. */
export interface DeclaredGrantSource {
  key?: string;
  name: string;
  nameDe?: string;
  source?: FeatureSource;
  grants?: FeatureGrant;
}

/**
 * Wohin jedes Feld von `FeatureGrant` fließt — die Aufzählung in `withGrant` ist von Hand und
 * würde ein neues Feld STILL ignorieren. Diese Tabelle ist über `keyof` total und bricht dann
 * den Build; dieselbe Absicherung wie bei `proficiencyGrantChanges`/`riderGrantChanges`.
 *
 *   `rider`    → über `withGrant` in den `FeatureRider` und von dort in `riderGrantChanges`
 *   `change`   → direkt als `Change` (`declaredGrantChanges`), weil der Rider das
 *                Ausgabevokabular des Modells ist und die Wirkung darin nichts zu suchen hat
 *   `perLevel` → je Charakterstufe, über `hpPerLevelSources`
 */
const GRANT_SINKS: { [K in keyof FeatureGrant]: 'rider' | 'change' | 'perLevel' } = {
  proficiencies: 'rider', // `weaponsOther` daraus zusätzlich als Change
  extraCantrips: 'rider',
  extraPreparedCount: 'rider',
  perLevel: 'perLevel',
  properties: 'change',
};
void GRANT_SINKS;

/**
 * Trägt eine Deklaration in einen Rider ein — und zwar GENAU die Felder, die
 * `featureGrantSchema` ausdrücken kann. Alles Übrige des Riders bleibt stehen, weil die
 * Deklaration darüber nichts sagt: `grantedSpells` gehört `grantsSpells`, `expertiseSkills`
 * gehört `grantsChoice.kind === 'expertise'`, `abilityScoreIncrease` ist bewusst nicht im
 * Schema (Korrektur 2 des Plans) und `tools`/`languages` sind kein geschlossenes Vokabular.
 * `perLevel` fehlt hier absichtlich: es wirkt je Charakterstufe und läuft über
 * `hpPerLevelSources`, nicht über den Rider.
 */
function withGrant(rider: FeatureRider, grants: FeatureGrant): FeatureRider {
  const p = grants.proficiencies;
  return {
    ...rider,
    extraCantrips: grants.extraCantrips,
    extraPreparedCount: grants.extraPreparedCount,
    proficiencies: {
      ...rider.proficiencies,
      skills: [...p.skills.fixed],
      weapons: [...p.weapons],
      armor: [...p.armor],
      savingThrows: [...p.savingThrows],
    },
  };
}

/**
 * **Die Deklaration gewinnt.** Für jedes Merkmal mit nicht-leerem `grants` werden die
 * deklarierten Werte in seinen Rider geschrieben; existiert keiner, entsteht einer. Damit ist
 * `grants` erstmals auch dann wirksam, wenn das Merkmal aus dem KI-Eingang fiel, die Deutung
 * übersprungen wurde (kein QM-Modell) oder sie das Merkmal übersah.
 *
 * Als Code-Regel an EINER Stelle statt als Prompt-Regel: das Modell kann die Deklaration gar
 * nicht sehen — `buildFeatureEffectsInput` projiziert nur die Prosa-Felder.
 *
 * `grants: {}` heißt „geprüft, gewährt nichts" (`isEmptyFeatureGrant`) — dann gibt es nichts zu
 * ersetzen und der KI-Rider bleibt unangetastet. Fehlt das Feld ganz, ist das Merkmal nicht
 * redigiert und die KI behält das letzte Wort.
 *
 * Gematcht über `featureKey`, ersatzweise über den englischen Namen — dieselbe Kette, mit der
 * Pass C seine Rider an die Merkmale bindet.
 */
export function withDeclaredGrants(riders: FeatureRider[], features: DeclaredGrantSource[]): FeatureRider[] {
  const byKey = new Map<string, DeclaredGrantSource>();
  const byName = new Map<string, DeclaredGrantSource>();
  for (const f of features) {
    if (!f.grants || isEmptyFeatureGrant(f.grants)) continue;
    // Erster Treffer gewinnt: dasselbe Merkmal erreicht den Flow aus mehreren Richtungen
    // (Delta und nachgeladene Subklassen-Merkmale), ein zweiter Rider wäre die Dublette.
    const key = f.key?.trim();
    if (key && !byKey.has(key)) byKey.set(key, f);
    const name = f.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, f);
  }
  if (!byKey.size && !byName.size) return riders;

  const applied = new Set<DeclaredGrantSource>();
  const out = riders.map((r) => {
    const key = r.featureKey.trim();
    const f = (key ? byKey.get(key) : undefined) ?? byName.get(r.featureName.trim().toLowerCase());
    if (!f?.grants) return r;
    applied.add(f);
    return withGrant(r, f.grants);
  });
  for (const f of new Set([...byKey.values(), ...byName.values()]))
    if (!applied.has(f)) out.push(withGrant(emptyRider(f), f.grants!));
  return out;
}

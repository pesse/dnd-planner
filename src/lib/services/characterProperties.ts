/**
 * Grundsätzliche Charaktereigenschaften aus einer Merkmals-Deklaration — Größenkategorie und
 * Grundbewegungsrate.
 *
 * Zwei Einstiege, eine Senke: `grants.properties` legt den Wert FEST (die sieben Spezies mit
 * eindeutiger Größe, alle zehn Bewegungsraten), `grantsChoice.kind === 'characterProperty'`
 * stellt ihn zur WAHL (Feenwesen, Mensch, Tiefling: „Klein oder Mittelgroß"). Beide enden im
 * selben `Change`, also auch in derselben Anwendung und demselben Protokoll.
 *
 * Kein LLM und kein Textparser: bis hierher las `services/speciesSize.ts` die Kategorien aus
 * dem englischen Merkmalstext, weil das Vault-Schema für „setze Eigenschaft X" kein Feld hatte.
 * Der Parser bleibt als Fallback für undeklarierte und Homebrew-Spezies stehen.
 *
 * Die Registry ist das Generische daran: Vokabular, Anzeige und Change-Ziel je Eigenschaft an
 * EINER Stelle, `PROPERTY_ROUTES` total über `keyof CharacterProperties`. Ein neues Feld am
 * Schema bricht damit den Build, statt still ohne Senke zu bleiben.
 */
import { CHARACTER_PROPERTIES, type CharacterProperties, type CharacterPropertyName } from '../schemas/grants';
import { MONSTER_SIZES, MONSTER_SIZE_KEYS } from '../schemas/vocabulary';
import { type FeatureChoiceGrant } from '../schemas/featureChoice';
import type { Change } from '../schemas/levelUp';
import type { AnalysisChoice } from './analysis/types';
import { declaredChoice } from './declaredChoice';
import type { DeclaredChoiceSource } from './declaration/source';

/** Herkunft eines Change — dieselbe Form wie bei `proficiencyGrantChanges`. */
type Meta = { step: string; source: string };

/**
 * Eine wählbare Eigenschaft: ihr Vokabular plus die deutschen Labels dazu. Nur Eigenschaften
 * mit geschlossenem Vokabular stehen hier — eine Zahl (Bewegungsrate) kann man nicht anbieten,
 * sie wird deklariert. Deshalb ist die Tabelle bewusst NICHT total über `CharacterPropertyName`.
 */
const PROPERTY_VOCABULARY: Partial<Record<CharacterPropertyName, { values: readonly string[]; labelDe: (v: string) => string }>> = {
  size: { values: MONSTER_SIZE_KEYS, labelDe: (v) => MONSTER_SIZES[v as keyof typeof MONSTER_SIZES] ?? v },
};

/** Deutscher Name der Eigenschaft selbst — für Frage und Protokollzeile. */
const PROPERTY_LABEL_DE: Record<CharacterPropertyName, string> = {
  size: 'Größenkategorie',
  speedFeet: 'Bewegungsrate',
};

/**
 * Wohin jede Eigenschaft fließt. Total über `keyof CharacterProperties` — ein neues Feld am
 * Schema bricht hier, wie `proficiencyGrantChanges` es für die Übungen tut.
 */
const PROPERTY_ROUTES: { [K in keyof CharacterProperties]-?: (value: NonNullable<CharacterProperties[K]>, meta: Meta) => Change } = {
  size: (value, meta) => ({ target: 'sizeCategory', value, ...meta, label: `Größenkategorie: ${MONSTER_SIZES[value]}` }),
  speedFeet: (value, meta) => ({ target: 'speedFeet', value, ...meta, label: `Bewegungsrate: ${value} Fuß` }),
};

/** Anzeigename einer Eigenschaft (Editor, Frage, Protokollzeile). */
export const characterPropertyLabelDe = (name: CharacterPropertyName): string => PROPERTY_LABEL_DE[name];

/**
 * Die wählbaren Eigenschaften samt ihrem Vokabular — für den Redaktions-Editor. Aus derselben
 * Registry wie Frage und Change, damit die Oberfläche keine zweite Werteliste pflegt.
 */
export function characterPropertyPickers(): {
  property: CharacterPropertyName;
  labelDe: string;
  values: { value: string; labelDe: string }[];
}[] {
  return CHARACTER_PROPERTIES.filter((name) => PROPERTY_VOCABULARY[name]).map((name) => {
    const vocab = PROPERTY_VOCABULARY[name]!;
    return {
      property: name,
      labelDe: PROPERTY_LABEL_DE[name],
      values: vocab.values.map((value) => ({ value, labelDe: vocab.labelDe(value) })),
    };
  });
}

/** Die festgelegten Eigenschaften einer Deklaration als `Change[]`. */
export function characterPropertyChanges(props: CharacterProperties | undefined, meta: Meta): Change[] {
  if (!props) return [];
  const out: Change[] = [];
  if (props.size !== undefined) out.push(PROPERTY_ROUTES.size(props.size, meta));
  if (props.speedFeet !== undefined) out.push(PROPERTY_ROUTES.speedFeet(props.speedFeet, meta));
  return out;
}

/** true, wenn die Deklaration keine einzige Eigenschaft festlegt. */
export const isEmptyCharacterProperties = (p: CharacterProperties | undefined): boolean =>
  !p || CHARACTER_PROPERTIES.every((name) => p[name] === undefined);

// ── Die Wahl (kind: 'characterProperty') ─────────────────────────────────────────

/** Ein Merkmal mit Eigenschafts-WAHL; die Deklaration steht dann fest. */
type PropertyDeclared = DeclaredChoiceSource & { grantsChoice: FeatureChoiceGrant & { property: CharacterPropertyName } };

export function isCharacterPropertyFeature(f: DeclaredChoiceSource): f is PropertyDeclared {
  const c = f.grantsChoice;
  return c?.kind === 'characterProperty' && !!c.property && !!PROPERTY_VOCABULARY[c.property];
}

export const propertyChoiceId = (f: DeclaredChoiceSource): string =>
  `property_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * Die zulässigen Werte: das Vokabular der Eigenschaft, verengt durch `propertyValues`. Ein
 * unbekannter Wert fällt weg statt die Liste zu vergiften — die Deklaration ist Vault-Inhalt,
 * und ein Tippfehler dort soll keine unbeantwortbare Frage erzeugen.
 */
export function characterPropertyOptions(grant: FeatureChoiceGrant): string[] {
  const vocab = grant.property ? PROPERTY_VOCABULARY[grant.property] : undefined;
  if (!vocab) return [];
  const wanted = grant.propertyValues.filter((v) => vocab.values.includes(v));
  return wanted.length ? wanted : [...vocab.values];
}

/**
 * Die Wahl einer Grundeigenschaft. Weniger als zwei Werte heißt: es gibt nichts zu fragen —
 * dann gehört der Wert als `grants.properties` an das Merkmal, nicht als Wahl.
 *
 * `isBuildDecision` ist true (anders als beim früheren Wizard-Sonderweg): erst der Eintrag im
 * Merkmals-Ledger macht die Antwort später im Charakter-Editor auffindbar und änderbar.
 * `personal.sizeCat` bleibt der Bogenwert, der Ledger-Eintrag ist die Provenienz.
 */
export function characterPropertyChoice(f: DeclaredChoiceSource): AnalysisChoice | null {
  if (!isCharacterPropertyFeature(f)) return null;
  const grant = f.grantsChoice;
  const options = characterPropertyOptions(grant);
  if (options.length < 2) return null;
  const vocab = PROPERTY_VOCABULARY[grant.property]!;
  const nameDe = f.nameDe || f.name;
  const propertyDe = PROPERTY_LABEL_DE[grant.property];
  return {
    ...declaredChoice({ id: propertyChoiceId(f), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    question: `${f.name}: choose one`,
    questionDe: propertyDe,
    options,
    optionsDe: options.map(vocab.labelDe),
    help: `Sets ${grant.property} on the sheet.`,
    helpDe: `Bestimmt die ${propertyDe} auf dem Bogen.`,
  };
}

/** Alle Eigenschafts-Wahlen einer Merkmalsliste, in Eingangsreihenfolge. */
export function characterPropertyChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features.map(characterPropertyChoice).filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Die getroffene Antwort als `Change` — derselbe, den die feste Deklaration erzeugt. Eine
 * Antwort außerhalb des Vokabulars wird verworfen: sie stammt dann aus einer geänderten
 * Deklaration und ist keine gültige Eigenschaft mehr.
 */
export function characterPropertyAnswerChanges(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
  meta: Meta,
): Change[] {
  const out: Change[] = [];
  for (const f of features) {
    if (!isCharacterPropertyFeature(f)) continue;
    const grant = f.grantsChoice;
    const answer = answerOf(propertyChoiceId(f)).trim();
    if (!answer || !characterPropertyOptions(grant).includes(answer)) continue;
    const source = { ...meta, source: f.key || meta.source };
    // Nur `size` hat heute ein Wahl-Vokabular; die Verzweigung ist der Preis dafür, dass die
    // Werte je Eigenschaft verschiedene Typen haben (Enum vs. Zahl).
    if (grant.property === 'size' && (MONSTER_SIZE_KEYS as readonly string[]).includes(answer))
      out.push(PROPERTY_ROUTES.size(answer as (typeof MONSTER_SIZE_KEYS)[number], source));
  }
  return out;
}

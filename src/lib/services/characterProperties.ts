/**
 * Größenkategorie und Bewegungsrate aus einer Merkmals-Deklaration: `grants.properties` legt
 * fest, `grantsChoice.kind === 'characterProperty'` stellt zur Wahl — beide enden im selben
 * `Change`. `speciesSize.ts` bleibt der Textparser-Fallback für undeklarierte Spezies.
 */
import { CHARACTER_PROPERTIES, type CharacterProperties, type CharacterPropertyName } from '../schemas/grants';
import { MONSTER_SIZES, MONSTER_SIZE_KEYS } from '../schemas/vocabulary';
import { type FeatureChoiceGrant } from '../schemas/featureChoice';
import type { Change } from '../schemas/levelUp';
import type { AnalysisChoice } from './analysis/types';
import { declaredChoice } from './declaredChoice';
import {
  choiceIdSuffix, declaredChoicesOfKind, featureIdPart, type DeclaredChoiceRef, type DeclaredChoiceSource,
} from './declaration/source';

type Meta = { step: string; source: string };

/**
 * Nur Eigenschaften mit geschlossenem Vokabular — eine Zahl kann man nicht anbieten. Deshalb
 * bewusst NICHT total über `CharacterPropertyName`.
 */
const PROPERTY_VOCABULARY: Partial<Record<CharacterPropertyName, { values: readonly string[]; labelDe: (v: string) => string }>> = {
  size: { values: MONSTER_SIZE_KEYS, labelDe: (v) => MONSTER_SIZES[v as keyof typeof MONSTER_SIZES] ?? v },
};

const PROPERTY_LABEL_DE: Record<CharacterPropertyName, string> = {
  size: 'Größenkategorie',
  speedFeet: 'Bewegungsrate',
};

/** Total über `keyof CharacterProperties` — ein neues Schemafeld bricht hier den Build. */
const PROPERTY_ROUTES: { [K in keyof CharacterProperties]-?: (value: NonNullable<CharacterProperties[K]>, meta: Meta) => Change } = {
  size: (value, meta) => ({ target: 'sizeCategory', value, ...meta, label: `Größenkategorie: ${MONSTER_SIZES[value]}` }),
  speedFeet: (value, meta) => ({ target: 'speedFeet', value, ...meta, label: `Bewegungsrate: ${value} Fuß` }),
};

export const characterPropertyLabelDe = (name: CharacterPropertyName): string => PROPERTY_LABEL_DE[name];

/** Aus derselben Registry wie Frage und Change — keine zweite Werteliste in der Oberfläche. */
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

export function characterPropertyChanges(props: CharacterProperties | undefined, meta: Meta): Change[] {
  if (!props) return [];
  const out: Change[] = [];
  if (props.size !== undefined) out.push(PROPERTY_ROUTES.size(props.size, meta));
  if (props.speedFeet !== undefined) out.push(PROPERTY_ROUTES.speedFeet(props.speedFeet, meta));
  return out;
}

export const isEmptyCharacterProperties = (p: CharacterProperties | undefined): boolean =>
  !p || CHARACTER_PROPERTIES.every((name) => p[name] === undefined);

/** Ohne Vokabular gibt es nichts anzubieten (`PROPERTY_VOCABULARY`). */
export function isCharacterPropertyRef(r: DeclaredChoiceRef): boolean {
  const g = r.grant;
  return g.kind === 'characterProperty' && !!g.property && !!PROPERTY_VOCABULARY[g.property];
}

export const characterPropertyRefs = <T extends DeclaredChoiceSource>(f: T): DeclaredChoiceRef<T>[] =>
  declaredChoicesOfKind(f, 'characterProperty').filter(isCharacterPropertyRef);

export const isCharacterPropertyFeature = (f: DeclaredChoiceSource): boolean =>
  characterPropertyRefs(f).length > 0;

export const propertyChoiceId = (r: DeclaredChoiceRef): string =>
  `property_${featureIdPart(r.feature)}${choiceIdSuffix(r.ordinal)}`;

/**
 * Ein unbekannter Wert fällt weg statt die Liste zu vergiften: die Deklaration ist
 * Vault-Inhalt, ein Tippfehler dort soll keine unbeantwortbare Frage erzeugen.
 */
export function characterPropertyOptions(grant: FeatureChoiceGrant): string[] {
  const vocab = grant.property ? PROPERTY_VOCABULARY[grant.property] : undefined;
  if (!vocab) return [];
  const wanted = grant.propertyValues.filter((v) => vocab.values.includes(v));
  return wanted.length ? wanted : [...vocab.values];
}

/**
 * Weniger als zwei Werte heißt: nichts zu fragen — dann gehört der Wert als
 * `grants.properties` ans Merkmal. `isBuildDecision` ist true, denn erst der Ledger-Eintrag
 * macht die Antwort im Charakter-Editor auffindbar; `personal.sizeCat` bleibt der Bogenwert.
 */
export function characterPropertyChoice(r: DeclaredChoiceRef): AnalysisChoice | null {
  if (!isCharacterPropertyRef(r)) return null;
  const { feature: f, grant } = r;
  const property = grant.property!;
  const options = characterPropertyOptions(grant);
  if (options.length < 2) return null;
  const vocab = PROPERTY_VOCABULARY[property]!;
  const nameDe = f.nameDe || f.name;
  const propertyDe = PROPERTY_LABEL_DE[property];
  return {
    ...declaredChoice({ id: propertyChoiceId(r), feature: f.name, featureDe: nameDe, featureKey: f.key ?? '' }),
    question: `${f.name}: choose one`,
    questionDe: propertyDe,
    options,
    optionsDe: options.map(vocab.labelDe),
    helpDe: `Bestimmt die ${propertyDe} auf dem Bogen.`,
  };
}

export function characterPropertyChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features
    .flatMap((f) => characterPropertyRefs(f).map(characterPropertyChoice))
    .filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Derselbe `Change`, den die feste Deklaration erzeugt. Eine Antwort außerhalb des Vokabulars
 * wird verworfen — sie stammt aus einer geänderten Deklaration.
 */
export function characterPropertyChange(r: DeclaredChoiceRef, answer: string, meta: Meta): Change | null {
  if (!isCharacterPropertyRef(r)) return null;
  const value = answer.trim();
  if (!value || !characterPropertyOptions(r.grant).includes(value)) return null;
  const source = { ...meta, source: r.feature.key || meta.source };
  // Verzweigt, weil die Werte je Eigenschaft verschiedene Typen haben (Enum vs. Zahl).
  if (r.grant.property === 'size' && (MONSTER_SIZE_KEYS as readonly string[]).includes(value))
    return PROPERTY_ROUTES.size(value as (typeof MONSTER_SIZE_KEYS)[number], source);
  return null;
}

export function characterPropertyAnswerChanges(
  features: DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
  meta: Meta,
): Change[] {
  return features
    .flatMap((f) => characterPropertyRefs(f).map((r) => characterPropertyChange(r, answerOf(propertyChoiceId(r)), meta)))
    .filter((c): c is Change => c !== null);
}

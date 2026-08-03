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
import type { DeclaredChoiceSource } from './declaration/source';

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

type PropertyDeclared = DeclaredChoiceSource & { grantsChoice: FeatureChoiceGrant & { property: CharacterPropertyName } };

export function isCharacterPropertyFeature(f: DeclaredChoiceSource): f is PropertyDeclared {
  const c = f.grantsChoice;
  return c?.kind === 'characterProperty' && !!c.property && !!PROPERTY_VOCABULARY[c.property];
}

export const propertyChoiceId = (f: DeclaredChoiceSource): string =>
  `property_${(f.key || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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

export function characterPropertyChoices(features: DeclaredChoiceSource[]): AnalysisChoice[] {
  return features.map(characterPropertyChoice).filter((c): c is AnalysisChoice => c !== null);
}

/**
 * Derselbe `Change`, den die feste Deklaration erzeugt. Eine Antwort außerhalb des Vokabulars
 * wird verworfen — sie stammt aus einer geänderten Deklaration.
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
    // Verzweigt, weil die Werte je Eigenschaft verschiedene Typen haben (Enum vs. Zahl).
    if (grant.property === 'size' && (MONSTER_SIZE_KEYS as readonly string[]).includes(answer))
      out.push(PROPERTY_ROUTES.size(answer as (typeof MONSTER_SIZE_KEYS)[number], source));
  }
  return out;
}

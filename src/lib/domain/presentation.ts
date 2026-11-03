import type { Presentation } from '$lib/schemas/characterSchema';

export const PRESENTATION_LABEL: Record<Presentation, string> = {
  feminine: 'Feminin', androgynous: 'Neutral', masculine: 'Maskulin',
};

/** Freitext-Geschlecht (Altbestand, D&D-Beyond-Merkmal „Gender"); was hier nicht steht, ist kein Äußeres. */
const GENDER_TO_PRESENTATION: [RegExp, Presentation][] = [
  [/^(m|männlich|maennlich|mann|male|man|maskulin|masculine|he\/him)$/i, 'masculine'],
  [/^(f|w|weiblich|frau|female|woman|feminin|feminine|she\/her)$/i, 'feminine'],
  [/^(d|divers|beides|neutral|androgyn|androgynous|nicht-?binär|non-?binary|nb|enby|they\/them)$/i, 'androgynous'],
];

export const presentationFromGender = (gender: string): Presentation | undefined =>
  GENDER_TO_PRESENTATION.find(([re]) => re.test(gender.trim()))?.[1];

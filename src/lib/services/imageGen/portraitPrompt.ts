/** Deterministischer Bild-Prompt fürs Charakterportrait: Motiv aus dem Charakter, Stil wählbar. */
import type { Character, Presentation } from '../../schemas/characterSchema';
import { slugOf } from '../wizard/originArt';
import type { PortraitTextKey, PortraitTranslation } from '../../schemas/portraitTranslation';

export interface ArtStyle { id: string; label: string; prompt: string; }

/** `series` ist der Stil der Stimmungsbilder (`design/art/prompt.md`), damit Portraits zur Serie passen. */
export const ART_STYLES: readonly ArtStyle[] = [
  {
    id: 'series',
    label: 'Gemälde (Serie)',
    prompt:
      "D&D Player's Handbook art, hand-painted oil/gouache, expressive brushwork, warm earthy palette " +
      '(ochre, umber, terracotta, slate blue), warm side light, soft shadows, grounded and heroic.',
  },
  {
    // Der Stilblock der Wizard-Figuren (`design/art-pipeline/variants/all/head.md`), auf FLUX gekürzt:
    // FLUX schnell kennt keinen Negativ-Prompt, deshalb nur die positiven Merkmale.
    id: 'concept',
    label: 'Concept-Art (Wizard)',
    prompt:
      "Traditional oil painting on canvas, classic D&D Player's Handbook book art: thick visible brushstrokes, " +
      'rough painterly texture, matte finish, richly painted fabric and weathered skin, warm earthy palette ' +
      '(ochre, umber, muted terracotta, slate blue), warm side light, three-quarter view, ' +
      'loosely painted background fading into warm parchment-colored edges.',
  },
  {
    id: 'ink',
    label: 'Tuschezeichnung',
    prompt: 'Pen-and-ink illustration, cross-hatching, sepia ink on aged parchment, old adventure-module style.',
  },
  {
    id: 'watercolor',
    label: 'Aquarell',
    prompt: 'Loose watercolor, soft bleeding washes, paper texture, gentle natural colors, pencil underdrawing.',
  },
  {
    id: 'dark',
    label: 'Düster',
    prompt: 'Dark fantasy painting, low-key lighting, deep shadows, desaturated palette, one warm accent light.',
  },
  {
    id: 'photo',
    label: 'Fotorealistisch',
    prompt: 'Photorealistic cinematic portrait, natural skin texture, shallow depth of field, soft key light.',
  },
  { id: 'none', label: 'Kein Stil', prompt: '' },
];

export const DEFAULT_ART_STYLE = 'series';

export function withArtStyle(subject: string, styleId: string): string {
  const style = ART_STYLES.find((s) => s.id === styleId)?.prompt ?? '';
  return [subject.trim(), style].filter(Boolean).join(' ');
}

/** Tauscht in einem von Hand geänderten Prompt den Stilblock aus; fehlt er, kommt der neue ans Ende. */
export function restyle(prompt: string, fromId: string, toId: string): string {
  const from = ART_STYLES.find((s) => s.id === fromId)?.prompt ?? '';
  const to = ART_STYLES.find((s) => s.id === toId)?.prompt ?? '';
  if (from && prompt.includes(from)) return prompt.replace(from, to).replace(/\s+$/, '');
  return withArtStyle(prompt, toId);
}

// Der Key-Slug ist der englische Bibliotheksname; der deutsche Anzeigename nur, wo kein Link besteht.
const linkedName = (sourceKey: string | undefined, name: string): string =>
  sourceKey ? slugOf(sourceKey).replace(/-/g, ' ') : name.trim();

// Das Editor-Formular führt „kein Äußeres" als '' statt undefined.
export type PortraitSource = Pick<Character, 'classes' | 'species' | 'personal'> & { presentation?: Presentation | '' };

/** „feminine"/„masculine" lösen den Inhaltsfilter von Cloudflare aus, „female"/„male" nicht. */
const PRESENTATION_PROMPT: Record<Presentation, string> = {
  feminine: 'female',
  androgynous: 'androgynous',
  masculine: 'male',
};

/**
 * Der Volksname allein reicht FLUX nicht — eine Zwergin wird sonst eine Menschenfrau. Nach den
 * Volksbeschreibungen der Wizard-Figuren (`design/art-pipeline/variants/all/figure.sh`), aufs Brustbild zugeschnitten.
 */
const SPECIES_LOOK: Record<string, string> = {
  dragonborn: 'Dragonborn: draconic humanoid with a scaled reptilian head and short snout, scales instead of skin.',
  dwarf: 'Dwarf: short, stout and broad-shouldered, broad sturdy face with strong features, thick neck.',
  elf: 'Elf: slender with long pointed ears and fine angular features.',
  fairy: 'Fairy: small fey folk with delicate insect-like wings behind the shoulders.',
  gnome: 'Gnome: small folk with large expressive eyes and slightly pointed ears.',
  goliath: 'Goliath: massive giant-kin with grey stone-like skin and dark markings.',
  halfling: 'Halfling: small folk with a round face and slightly pointed ears.',
  orc: 'Orc: broad and powerful with a heavy brow and prominent lower tusks.',
  tiefling: 'Tiefling: human-like with curved horns and solid-coloured eyes.',
};

/** Ohne Subklasse: „Oath of Devotion" & Co. lösen die Inhaltsfilter der Anbieter aus. */
function classPhrase(c: PortraitSource): string {
  return c.classes.map((cl) => linkedName(cl.sourceKey, cl.name)).filter(Boolean).join(' / ');
}

type PersonalKey = keyof PortraitSource['personal'];

/** Die Aussehensfelder in Dialog-Reihenfolge, deutsch beschriftet für den Dialog, englisch für den Prompt. */
export const PORTRAIT_FIELDS: readonly { key: PersonalKey; label: string; promptLabel: string; textKey: PortraitTextKey }[] = [
  { key: 'alter', label: 'Alter', promptLabel: 'Age', textKey: 'age' },
  { key: 'koerpergroesse', label: 'Körpergröße', promptLabel: 'Height', textKey: 'height' },
  { key: 'hautfarbe', label: 'Hautfarbe', promptLabel: 'Skin', textKey: 'skin' },
  { key: 'haarfarbe', label: 'Haarfarbe', promptLabel: 'Hair', textKey: 'hair' },
  { key: 'augenfarbe', label: 'Augenfarbe', promptLabel: 'Eyes', textKey: 'eyes' },
  { key: 'aussehen', label: 'Aussehen', promptLabel: 'Appearance', textKey: 'appearance' },
];

/** Die deutschen Texte, die eine Übersetzung brauchen — Schlüssel wie in `PortraitTranslation`. */
export function portraitTexts(c: PortraitSource, extra: string): PortraitTexts {
  return {
    ...Object.fromEntries(PORTRAIT_FIELDS.map((f) => [f.textKey, String(c.personal[f.key] ?? '').trim()])),
    extra: extra.trim(),
  };
}

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

export type PortraitTexts = Partial<Record<PortraitTextKey, string>>;
export interface TranslatedTexts { source: PortraitTexts; en: PortraitTranslation; }

/** Je Feld die englische Fassung — nur solange der deutsche Text noch der übersetzte ist. */
export function currentEnglish(texts: PortraitTexts, translation: TranslatedTexts | null): PortraitTexts {
  if (!translation) return {};
  return Object.fromEntries(
    (Object.keys(texts) as PortraitTextKey[])
      .filter((k) => texts[k] && translation.source[k] === texts[k] && translation.en[k].trim())
      .map((k) => [k, translation.en[k].trim()]),
  );
}

function traitLines(c: PortraitSource, english: PortraitTexts, keys?: readonly PortraitTextKey[]): string[] {
  return PORTRAIT_FIELDS
    .filter((f) => !keys || keys.includes(f.textKey))
    .map((f) => [f.promptLabel, english[f.textKey] || String(c.personal[f.key] ?? '').trim()])
    .filter(([, v]) => v)
    .map(([label, v]) => sentence(`${label}: ${v}`));
}

/** Alter und Größe fehlen: Die Puppe gibt die Größe vor, und „92" liest das Modell als Greis statt als jungen Zwerg. */
export const figureTraits = (c: PortraitSource, english: PortraitTexts = {}): string =>
  traitLines(c, english, ['skin', 'hair', 'eyes', 'appearance']).join(' ');

/** Das Motiv ohne Stil. Ohne `english` steht Freitext so im Prompt, wie er im Bogen gepflegt ist. */
export function buildPortraitSubject(
  c: PortraitSource,
  extra = '',
  english: PortraitTexts = {},
): string {
  const extraText = english.extra || extra.trim();
  const subject = [
    c.presentation ? PRESENTATION_PROMPT[c.presentation] : '',
    linkedName(c.species.sourceKey, c.species.name),
    classPhrase(c) || 'adventurer',
  ].filter(Boolean).join(' ');

  return [
    `Head-and-shoulders portrait: ${subject}, face visible.`,
    c.species.sourceKey && SPECIES_LOOK[slugOf(c.species.sourceKey)],
    ...traitLines(c, english),
    extraText && sentence(`Also: ${extraText}`),
    'No text.',
  ].filter(Boolean).join(' ');
}

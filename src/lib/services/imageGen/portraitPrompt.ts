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

// Der Key-Slug ist der englische Bibliotheksname; der deutsche Anzeigename nur, wo kein Link besteht.
const linkedName = (sourceKey: string | undefined, name: string): string =>
  sourceKey ? slugOf(sourceKey).replace(/-/g, ' ') : name.trim();

// Das Editor-Formular führt „kein Äußeres" als '' statt undefined.
export type PortraitSource = Pick<Character, 'classes' | 'species' | 'personal'> & { presentation?: Presentation | '' };

function classPhrase(c: PortraitSource): string {
  return c.classes
    .map((cl) => {
      const base = linkedName(cl.sourceKey, cl.name);
      const sub = cl.subclassKey ? linkedName(cl.subclassKey, '') : (cl.subclassName ?? '').trim();
      return base && sub ? `${base} (${sub})` : base;
    })
    .filter(Boolean)
    .join(' / ');
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

function traitLines(c: PortraitSource, english: PortraitTexts): string[] {
  return PORTRAIT_FIELDS
    .map((f) => [f.promptLabel, english[f.textKey] || String(c.personal[f.key] ?? '').trim()])
    .filter(([, v]) => v)
    .map(([label, v]) => sentence(`${label}: ${v}`));
}

/** Das Motiv ohne Stil. Ohne `english` steht Freitext so im Prompt, wie er im Bogen gepflegt ist. */
export function buildPortraitSubject(
  c: PortraitSource,
  extra = '',
  english: PortraitTexts = {},
): string {
  const extraText = english.extra || extra.trim();
  const subject = [
    c.presentation ?? '',
    linkedName(c.species.sourceKey, c.species.name),
    classPhrase(c) || 'adventurer',
  ].filter(Boolean).join(' ');

  return [
    `Head-and-shoulders portrait: ${subject}, face visible.`,
    ...traitLines(c, english),
    extraText && sentence(`Also: ${extraText}`),
    'No text.',
  ].filter(Boolean).join(' ');
}

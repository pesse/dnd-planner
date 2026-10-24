/** Deterministischer Bild-Prompt fürs Charakterportrait: Motiv aus dem Charakter, Stil wählbar. */
import type { Character, Presentation } from '../../schemas/characterSchema';
import { slugOf } from '../wizard/originArt';

export interface ArtStyle { id: string; label: string; prompt: string; }

/** `series` ist der Stil der Stimmungsbilder (`design/art/prompt.md`), damit Portraits zur Serie passen. */
export const ART_STYLES: readonly ArtStyle[] = [
  {
    id: 'series',
    label: 'Gemälde (Serie)',
    prompt:
      "Classic Dungeons & Dragons Player's Handbook book art: hand-painted fantasy illustration with an " +
      'oil/gouache look, visible expressive brushwork, warm earthy colors (ochre, umber, muted terracotta, ' +
      'restrained slate blue), dramatic but natural warm side lighting, soft atmospheric shadows. Heroic, ' +
      'grounded, believable anatomy; painterly rather than photographic.',
  },
  {
    id: 'ink',
    label: 'Tuschezeichnung',
    prompt:
      'Detailed pen-and-ink fantasy illustration with cross-hatching on aged parchment, sepia ink, ' +
      'old adventure-module style, monochrome.',
  },
  {
    id: 'watercolor',
    label: 'Aquarell',
    prompt:
      'Loose watercolor fantasy illustration, soft bleeding washes, light paper texture, gentle ' +
      'natural colors, delicate pencil underdrawing.',
  },
  {
    id: 'dark',
    label: 'Düster',
    prompt:
      'Dark fantasy digital painting, moody low-key lighting, deep shadows, muted desaturated ' +
      'palette with a single warm accent light, gritty and grounded.',
  },
  {
    id: 'photo',
    label: 'Fotorealistisch',
    prompt:
      'Photorealistic cinematic fantasy portrait, natural skin texture, shallow depth of field, ' +
      'soft key light, film still.',
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
type PortraitSource = Pick<Character, 'classes' | 'species' | 'personal'> & { presentation?: Presentation | '' };

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

/** Das Motiv ohne Stil. Freitext steht so, wie er im Bogen gepflegt ist — oft Deutsch. */
export function buildPortraitSubject(c: PortraitSource): string {
  const p = c.personal;
  const subject = [
    c.presentation ?? '',
    linkedName(c.species.sourceKey, c.species.name),
    classPhrase(c) || 'adventurer',
  ].filter(Boolean).join(' ');

  const details = [
    ['Gender', c.presentation ? '' : p.geschlecht],
    ['Age', p.alter],
    ['Height', p.koerpergroesse],
    ['Skin', p.hautfarbe],
    ['Hair', p.haarfarbe],
    ['Eyes', p.augenfarbe],
    ['Appearance', p.aussehen],
  ]
    .filter(([, v]) => v.trim())
    .map(([label, v]) => `${label}: ${v.trim()}.`);

  return [
    `Head-and-shoulders portrait, face clearly visible. Subject: ${subject}.`,
    ...details,
    'No text, no lettering.',
  ].join(' ');
}

/**
 * Die Detailseite: Volks- und Klassenmerkmale als Freitext, Talente im Volltext,
 * Persönliches, Freitext. Die Textkästen nehmen die ganze Breite und spalten sich innen (`cols`).
 */
import { renderMarkdown, ruleText } from '$lib/utils/markdown';
import type { ResolvedFeature } from '$lib/services/characterFeatures';
import type { CharacterPrintData } from '../data';
import { block, esc, escLines, row } from '../html';

function feature(f: ResolvedFeature): string {
  const level = f.gainedAt ? `<span class="feat-level"> (Stufe ${f.gainedAt})</span>` : '';
  const choice = f.choice ? `<div class="feat-choice">Gewählt: ${esc(f.choice)}</div>` : '';
  const desc = f.desc ? `<div class="feat-desc md">${renderMarkdown(ruleText(f.desc))}</div>` : '';
  return `<div class="feat"><div class="feat-name">${esc(f.name)}${level}</div>${choice}${desc}</div>`;
}

/**
 * Volks- und Klassenmerkmale stehen als gepflegter Freitext auf dem Bogen, nicht als die
 * aufgelöste Bibliotheksliste: die füllt mehrere Seiten und steht am Bildschirm ohnehin.
 */
const proseBlock = (title: string, text: string): string =>
  text.trim() ? block(title, `<div class="prose">${escLines(text)}</div>`, { cls: 'wide cols' }) : '';

export const renderSpeciesFeatures = (d: CharacterPrintData): string =>
  proseBlock('Volksmerkmale', d.character.personal?.rassenmerkmale ?? '');

export const renderClassFeatures = (d: CharacterPrintData): string =>
  proseBlock('Klassenmerkmale', d.character.classFeatures);

export function renderFeats(d: CharacterPrintData): string {
  const entries = d.features.featEntries;
  if (!entries.length) return '';
  return block('Talente', entries.map(feature).join(''), { cls: 'wide cols' });
}

const PERSONAL_ROWS: [string, keyof CharacterPrintData['character']['personal']][] = [
  ['Alter', 'alter'], ['Geschlecht', 'geschlecht'], ['Gesinnung', 'gesinnung'],
  ['Glaube', 'glaube'], ['Größe', 'sizeCat'], ['Körpergröße', 'koerpergroesse'],
  ['Gewicht', 'gewicht'], ['Augen', 'augenfarbe'], ['Haar', 'haarfarbe'],
  ['Haut', 'hautfarbe'], ['Lebensstil', 'lebensstil'], ['Tägl. Kosten', 'taeglicheKosten'],
];

export function renderPersonal(d: CharacterPrintData): string {
  const p = d.character.personal;
  if (!p) return '';
  // Nur gefüllte Zeilen: zwölf Feldnamen für einen gepflegten Wert kosten ein halbes Blatt,
  // und der Bogen soll auf zwei Seiten bleiben.
  const rows = PERSONAL_ROWS.filter(([, key]) => p[key]?.trim())
    .map(([label, key]) => row(label, esc(p[key]))).join('');
  const appearance = p.aussehen?.trim()
    ? `<div class="feat"><div class="feat-name">Aussehen</div><div class="prose">${escLines(p.aussehen)}</div></div>` : '';
  const body = rows + appearance;
  return body ? block('Persönliches', body) : '';
}

export function renderFreetext(d: CharacterPrintData): string {
  const text = d.freetext.trim();
  if (!text) return '';
  return block('Notizen', `<div class="md">${renderMarkdown(text)}</div>`, { cls: 'wide cols' });
}

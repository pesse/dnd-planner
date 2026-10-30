/** Woher eine Zeile der Angriffstabelle kommt, als kleines Zeichen für Bogen und Druck. */
import type { Attack } from '../schemas/characterSchema';
import { esc } from '../print/character/html';
import type { AttackEffectOrigin, AttackFootnote } from './attackEffects';

export type AttackOrigin = AttackEffectOrigin | 'weapon';

/** Handgetippte Zeilen haben keine erkennbare Herkunft und bleiben ohne Zeichen. */
export const attackOriginOf = (a: Pick<Attack, 'spell' | 'sourceKey'>): AttackOrigin | null =>
  a.spell ? 'spell' : a.sourceKey?.trim() ? 'weapon' : null;

export const ATTACK_ORIGIN_LABEL: Record<AttackOrigin, string> = {
  weapon: 'Waffe',
  spell: 'Zauber',
  feature: 'Merkmal',
  item: 'Gegenstand',
};

const svg = (body: string): string =>
  `<svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS: Record<AttackOrigin, string> = {
  weapon: svg('<path d="M13.5 2.5 L13 5 L6.5 11.5 L4.5 9.5 L11 3 Z"/><path d="M3.5 8.5 L7.5 12.5 M5 11 L2.5 13.5"/>'),
  spell: svg('<path d="M8 1.5 L9.3 6.7 L14.5 8 L9.3 9.3 L8 14.5 L6.7 9.3 L1.5 8 L6.7 6.7 Z" fill="currentColor" stroke="none"/>'),
  feature: svg('<path d="M8 1.8 L13.5 3.8 V8 C13.5 11.2 11 13.3 8 14.3 C5 13.3 2.5 11.2 2.5 8 V3.8 Z"/>'),
  item: svg('<path d="M4.5 2.5 H11.5 L14.5 6 L8 14 L1.5 6 Z M1.5 6 H14.5"/>'),
};

/** Fertiges HTML; `title` trägt den Namen für den Mauszeiger. */
export const attackOriginIcon = (origin: AttackOrigin): string =>
  `<span class="atk-origin atk-origin-${origin}" title="${ATTACK_ORIGIN_LABEL[origin]}">${ICONS[origin]}</span>`;

/** Zeichen, dann die Quelle fett: „★ **Zeichen des Jägers** +1W6 …". */
export function attackFootnoteHtml(n: AttackFootnote): string {
  const head = n.labelDe && n.text.startsWith(n.labelDe) ? n.labelDe : '';
  const body = head ? `<b>${esc(head)}</b>${esc(n.text.slice(head.length))}` : esc(n.text);
  return `${attackOriginIcon(n.origin)}${body}`;
}

/** „★ Zauber · ⛨ Merkmal" — nur die Zeichen, die im Kasten vorkommen, in fester Reihenfolge. */
export function attackOriginLegend(used: Iterable<AttackOrigin | null>): string {
  const set = new Set(used);
  return (Object.keys(ATTACK_ORIGIN_LABEL) as AttackOrigin[])
    .filter((o) => set.has(o))
    .map((o) => `${attackOriginIcon(o)}${ATTACK_ORIGIN_LABEL[o]}`)
    .join(' · ');
}

/**
 * Verweise im Karten-Cockpit: Regel-Links öffnen ein angeheftetes Tooltip-Fenster statt die
 * Karte zu verlassen, Würfelangaben („1W4", „2W6 + 3", „Angriffswurf: +4") legen ihren Wurf in die Würfel-Box.
 */
import { getRuleByKey } from '../../../rulesLibrary';
import { RULE_REF_SCHEME } from '../../../services/vaultLinks';
import { pinTip } from '../../../services/battleMap/pinnedTips.svelte';
import { prepareRoll } from '../../../services/battleMap/diceTray.svelte';
import { ruleTipMarkdown } from '../../ruleRefLinks.svelte';

const DICE = /(?<![\p{L}\d])\d*[WwDd]\d+(?:\s*[+−-]\s*\d+(?![\p{L}\d]))?(?![\p{L}\d])/gu;
/** Nur der Bonus wird zum Verweis, geworfen wird ein W20 mit ihm. */
const ATTACK = /(?<=(?:angriffswurf|attack roll):\s*)[+−-]\d+/giu;
const SKIP = 'input, textarea, button, [contenteditable], script, style, [data-no-dice-refs]';
const HIGHLIGHT = 'dice-ref';

interface DiceRef {
  range: Range;
  formula: string;
}

const normalize = (s: string): string => s.replace(/\s+/g, '').replace('−', '-').toUpperCase().replace('D', 'W');

function diceRefs(root: HTMLElement): DiceRef[] {
  const refs: DiceRef[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // „*Angriffswurf:* +4" trennt Markdown in zwei Textknoten; der Bonus braucht den Vorgänger.
  let tail = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest(SKIP)) continue;
    const text = n.textContent ?? '';
    const add = (index: number, length: number, formula: string) => {
      const range = document.createRange();
      range.setStart(n!, index);
      range.setEnd(n!, index + length);
      refs.push({ range, formula });
    };
    for (const m of text.matchAll(DICE)) add(m.index!, m[0].length, normalize(m[0]));
    for (const m of (tail + text).matchAll(ATTACK)) {
      const index = m.index! - tail.length;
      if (index >= 0) add(index, m[0].length, `W20${normalize(m[0])}`);
    }
    tail = text.slice(-40);
  }
  return refs;
}

export function mapRefs(node: HTMLElement) {
  const highlights = 'highlights' in CSS ? CSS.highlights : null;
  let refs: DiceRef[] = [];
  let frame = 0;
  let pointed: HTMLElement | null = null;

  const scan = () => {
    frame = 0;
    refs = diceRefs(node);
    highlights?.set(HIGHLIGHT, new Highlight(...refs.map((r) => r.range)));
  };
  const observer = new MutationObserver(() => {
    frame ||= requestAnimationFrame(scan);
  });
  observer.observe(node, { childList: true, subtree: true, characterData: true });
  scan();

  const hit = (e: MouseEvent): DiceRef | undefined => {
    const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!caret) return;
    return refs.find((r) => r.range.isPointInRange(caret.startContainer, caret.startOffset));
  };

  const click = (e: MouseEvent) => {
    const link = (e.target as Element).closest?.<HTMLAnchorElement>(`a[href^="${RULE_REF_SCHEME}"]`);
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const key = (link.getAttribute('href') ?? '').slice(RULE_REF_SCHEME.length).trim();
      void getRuleByKey(key).then((r) => r && pinTip(ruleTipMarkdown(r), e.clientX + 12, e.clientY + 12));
      return;
    }
    const dice = hit(e);
    if (!dice) return;
    e.preventDefault();
    e.stopPropagation();
    prepareRoll(dice.formula);
  };

  const move = (e: MouseEvent) => {
    const over = hit(e) ? (e.target as HTMLElement) : null;
    if (over === pointed) return;
    if (pointed) pointed.style.cursor = '';
    pointed = over;
    if (pointed) pointed.style.cursor = 'pointer';
  };

  node.addEventListener('click', click, true);
  node.addEventListener('mousemove', move);
  return {
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      node.removeEventListener('click', click, true);
      node.removeEventListener('mousemove', move);
      highlights?.delete(HIGHLIGHT);
    },
  };
}

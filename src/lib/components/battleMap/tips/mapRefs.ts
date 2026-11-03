/**
 * Verweise im Karten-Cockpit: Regel-Links öffnen ein angeheftetes Tooltip-Fenster statt die
 * Karte zu verlassen, Würfelangaben („1W4", „2W6 + 3") legen ihren Wurf in die Würfel-Box.
 */
import { getRuleByKey } from '../../../rulesLibrary';
import { RULE_REF_SCHEME } from '../../../services/vaultLinks';
import { pinTip } from '../../../services/battleMap/pinnedTips.svelte';
import { prepareRoll } from '../../../services/battleMap/diceTray.svelte';
import { ruleTipMarkdown } from '../../ruleRefLinks.svelte';

const DICE = /(?<![\p{L}\d])\d*[WwDd]\d+(?:\s*[+−-]\s*\d+(?![\p{L}\d]))?(?![\p{L}\d])/gu;
const SKIP = 'input, textarea, button, [contenteditable], script, style';
const HIGHLIGHT = 'dice-ref';

function diceRanges(root: HTMLElement): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest(SKIP)) continue;
    for (const m of (n.textContent ?? '').matchAll(DICE)) {
      const r = document.createRange();
      r.setStart(n, m.index!);
      r.setEnd(n, m.index! + m[0].length);
      ranges.push(r);
    }
  }
  return ranges;
}

const formulaOf = (r: Range): string => r.toString().replace(/\s+/g, '').replace('−', '-').toUpperCase().replace('D', 'W');

export function mapRefs(node: HTMLElement) {
  const highlights = 'highlights' in CSS ? CSS.highlights : null;
  let ranges: Range[] = [];
  let frame = 0;
  let pointed: HTMLElement | null = null;

  const scan = () => {
    frame = 0;
    ranges = diceRanges(node);
    highlights?.set(HIGHLIGHT, new Highlight(...ranges));
  };
  const observer = new MutationObserver(() => {
    frame ||= requestAnimationFrame(scan);
  });
  observer.observe(node, { childList: true, subtree: true, characterData: true });
  scan();

  const hit = (e: MouseEvent): Range | undefined => {
    const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!caret) return;
    return ranges.find((r) => r.isPointInRange(caret.startContainer, caret.startOffset));
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
    prepareRoll(formulaOf(dice));
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

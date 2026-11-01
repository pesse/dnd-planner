/** Scroll-Position als Teil des Verlaufs: beim Verlassen gemerkt, bei Zurück/Vor wiederhergestellt. */
import { activeFile } from '../stores/campaign';
import { arrivalReader, registerViewState } from '../services/viewState';

const SETTLE_MS = 5000;
const USER_INPUT = ['wheel', 'pointerdown', 'keydown'] as const;

/** Der Inhalt lädt nach: gesetzt wird erst, wenn er hoch genug ist — und nie gegen den Nutzer. */
function restoreScroll(node: HTMLElement, top: number): () => void {
  const deadline = performance.now() + SETTLE_MS;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of USER_INPUT) node.removeEventListener(type, stop);
  };
  const attempt = () => {
    if (node.scrollHeight - node.clientHeight >= top || performance.now() > deadline) {
      node.scrollTop = top;
      stop();
    } else {
      frame = requestAnimationFrame(attempt);
    }
  };
  for (const type of USER_INPUT) node.addEventListener(type, stop, { passive: true });
  // Erst im nächsten Frame: bis dahin steht noch der Inhalt des vorigen Eintrags im DOM.
  frame = requestAnimationFrame(attempt);
  return stop;
}

export function historyScroll(node: HTMLElement) {
  const read = arrivalReader('scroll');
  let cancel = () => {};
  const unregister = registerViewState('scroll', () => node.scrollTop);
  const unsubscribe = activeFile.subscribe(() => {
    const arrived = read();
    if (!arrived) return;
    cancel();
    cancel = restoreScroll(node, arrived.value ?? 0);
  });
  return {
    destroy() {
      cancel();
      unregister();
      unsubscribe();
    },
  };
}

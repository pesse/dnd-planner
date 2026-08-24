import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { FileEntry } from '../../src/lib/types';

/** Der Verlauf ist Modul-State — jeder Fall braucht eine frische Instanz. */
async function freshHistory() {
  vi.resetModules();
  return import('../../src/lib/stores/navigationHistory');
}

const entry = (name: string): FileEntry => ({ name, path: `./vault/notes/${name}.md`, type: 'notes' });
const anywhere = async () => true;

describe('navigationHistory', () => {
  it('führt zurück und vor durch die geöffneten Einträge', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.pushHistory(entry('c'));

    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('b');
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('a');
    expect(get(h.navHistoryState)).toEqual({ canBack: false, canForward: true });
    expect(await h.stepHistory(-1, anywhere)).toBeNull();

    expect((await h.stepHistory(1, anywhere))?.name).toBe('b');
    expect((await h.stepHistory(1, anywhere))?.name).toBe('c');
    expect(await h.stepHistory(1, anywhere)).toBeNull();
  });

  it('verwirft den Vor-Stapel, sobald ein neues Ziel geöffnet wird', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    await h.stepHistory(-1, anywhere);
    expect(get(h.navHistoryState).canForward).toBe(true);

    h.pushHistory(entry('c'));
    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('a');
  });

  it('sammelt denselben Eintrag nicht doppelt', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.pushHistory(entry('b'));
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('a');
    expect(get(h.navHistoryState).canBack).toBe(false);
  });

  it('überspringt unerreichbare Ziele und lässt sie herausfallen', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('gone'));
    h.pushHistory(entry('c'));

    const reachable = async (e: FileEntry) => e.name !== 'gone';
    expect((await h.stepHistory(-1, reachable))?.name).toBe('a');
    expect(get(h.navHistoryState)).toEqual({ canBack: false, canForward: true });
    expect((await h.stepHistory(1, reachable))?.name).toBe('c');
  });

  it('meldet leer, wenn kein Ziel mehr erreichbar ist', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    expect(await h.stepHistory(-1, async () => false)).toBeNull();
    expect(get(h.navHistoryState)).toEqual({ canBack: false, canForward: false });
  });

  it('legt beim Umbenennen keinen Eintrag an, sondern korrigiert den Pfad', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.replaceHistory({ name: 'b2', path: './vault/notes/b2.md', type: 'notes' });

    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('a');
    expect((await h.stepHistory(1, anywhere))?.path).toBe('./vault/notes/b2.md');
  });

  it('behält den Zurück-Weg, wenn der aktive Eintrag verschwindet', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.dropHistoryCurrent();

    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect((await h.stepHistory(-1, anywhere))?.name).toBe('a');
    // Der gelöschte Eintrag darf auch nicht über „Vor" zurückkehren.
    expect(get(h.navHistoryState).canForward).toBe(false);
  });
});

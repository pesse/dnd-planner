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
/** Name des Ziels, `home` für die Startseite, `null` für „kein Schritt möglich". */
const nameOf = (item: { file: FileEntry | null } | null) => (item ? (item.file?.name ?? 'home') : null);

describe('navigationHistory', () => {
  it('führt zurück und vor durch die geöffneten Einträge bis zur Startseite', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));

    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('home');
    expect(get(h.navHistoryState)).toEqual({ canBack: false, canForward: true });
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBeNull();

    expect(nameOf(await h.stepHistory(1, anywhere))).toBe('a');
    expect(nameOf(await h.stepHistory(1, anywhere))).toBe('b');
    expect(nameOf(await h.stepHistory(1, anywhere))).toBeNull();
  });

  it('macht die Startseite zu einem Ort, zu dem Vor zurückfindet', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(null);
    h.pushHistory(entry('b'));

    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('home');
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
    expect(nameOf(await h.stepHistory(1, anywhere))).toBe('home');
  });

  it('gibt jedem Ort den Zustand zurück, mit dem er verlassen wurde', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.setHistoryState({ scroll: 120, cardTab: 'bearbeiten' });
    h.pushHistory(entry('b'), { scroll: 0 });
    h.setHistoryState({ scroll: 40 });

    expect((await h.stepHistory(-1, anywhere))?.state).toEqual({ scroll: 120, cardTab: 'bearbeiten' });
    expect((await h.stepHistory(1, anywhere))?.state).toEqual({ scroll: 40 });
  });

  it('verwirft den Vor-Stapel, sobald ein neues Ziel geöffnet wird', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    await h.stepHistory(-1, anywhere);
    expect(get(h.navHistoryState).canForward).toBe(true);

    h.pushHistory(entry('c'));
    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
  });

  it('sammelt denselben Ort nicht doppelt und behält dabei seinen Zustand', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.setHistoryState({ scroll: 80 });
    expect(h.pushHistory(entry('b')).state).toEqual({ scroll: 80 });
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('home');
    expect(get(h.navHistoryState).canBack).toBe(false);
  });

  it('überspringt unerreichbare Ziele und lässt sie herausfallen', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('gone'));
    h.pushHistory(entry('c'));

    const reachable = async (e: FileEntry | null) => e?.name !== 'gone';
    expect(nameOf(await h.stepHistory(-1, reachable))).toBe('a');
    expect(nameOf(await h.stepHistory(1, reachable))).toBe('c');
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
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
    expect((await h.stepHistory(1, anywhere))?.file?.path).toBe('./vault/notes/b2.md');
  });

  it('setzt die Startseite an die Stelle eines gelöschten Eintrags', async () => {
    const h = await freshHistory();
    h.pushHistory(entry('a'));
    h.pushHistory(entry('b'));
    h.dropHistoryCurrent();

    expect(get(h.navHistoryState)).toEqual({ canBack: true, canForward: false });
    expect(nameOf(await h.stepHistory(-1, anywhere))).toBe('a');
    // Der gelöschte Eintrag darf über „Vor" nicht zurückkehren.
    expect(nameOf(await h.stepHistory(1, anywhere))).toBe('home');
  });
});

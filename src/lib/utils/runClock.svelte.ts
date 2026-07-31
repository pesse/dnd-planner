/**
 * Laufzeit-Uhr für KI-Läufe: Sekundenanzeige und Hänger-Erkennung.
 * Ohne Antwort binnen 50 s gilt der Lauf als hängend — der Nutzer bekommt
 * „neu versuchen/abbrechen" angeboten, statt unbegrenzt zu warten.
 */
import { onDestroy } from 'svelte';

const STALL_MS = 50_000;

export function createRunClock(running: () => boolean) {
  let nowMs = $state(0);
  let runStartMs = 0;
  let lastActivityMs = $state(0);
  let tick: ReturnType<typeof setInterval> | null = null;

  const elapsedSec = $derived(running() ? Math.max(0, Math.floor((nowMs - runStartMs) / 1000)) : 0);
  const stalledSec = $derived(running() ? Math.max(0, Math.floor((nowMs - lastActivityMs) / 1000)) : 0);
  const stalled = $derived(running() && nowMs - lastActivityMs > STALL_MS);

  function start() {
    runStartMs = Date.now();
    lastActivityMs = Date.now();
    nowMs = Date.now();
    tick = setInterval(() => {
      nowMs = Date.now();
    }, 500);
  }

  function stop() {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
  }

  onDestroy(stop);

  return {
    get elapsedSec() {
      return elapsedSec;
    },
    get stalledSec() {
      return stalledSec;
    },
    get stalled() {
      return stalled;
    },
    start,
    stop,
    /** Meldet Fortschritt — setzt die Hänger-Uhr zurück. */
    touch() {
      lastActivityMs = Date.now();
    },
  };
}

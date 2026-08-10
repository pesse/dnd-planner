/**
 * Aufgelöste Vorräte → die Sichten darauf: Zauberplätze für den Zauberpfad, Zeilen für Editor
 * und Bogen.
 */
import type { ResourceRecharge } from '$lib/schemas/resource';
import type { ResolvedResource } from './resolve';
import { NINE, PACT_POOL, SLOT_POOL } from './slots';

export interface SpellPools {
  /** Index 0 = Grad 1. */
  standard: number[];
  pact: number[];
}

/** Ein Platz-Vorrat unter seinem klassenübergreifenden Namen; leer, wenn ihn keiner deklariert. */
export const sharedSlots = (pools: ResolvedResource[], name: string): number[] => {
  const pool = pools.find((p) => p.shared === name && p.kind === 'slots');
  return pool ? NINE(pool.max) : NINE();
};

/** Die Nachschlagefunktion, mit der `castOption.slots.pool` seinen Vorrat findet. */
export const slotLookup =
  (pools: ResolvedResource[]) =>
  (name: string): number[] =>
    sharedSlots(pools, name);

export const spellPools = (pools: ResolvedResource[]): SpellPools => ({
  standard: sharedSlots(pools, SLOT_POOL),
  pact: sharedSlots(pools, PACT_POOL),
});

/** Auffüll-Rast: die App nennt sie, sie führt sie nicht aus. */
const RECHARGE_DE: Record<ResourceRecharge, string> = {
  'long-rest': 'Lange Rast',
  'short-rest': 'Kurze Rast',
  dawn: 'Morgengrauen',
  none: '',
};

/** Eine Zeile je Vorrat, wie Bogen, Karte und Editor sie zeigen. */
export interface ResourceView {
  id: string;
  label: string;
  /** Auffüll-Rast und, wo eine krumme Zahl es verlangt, ihre Herkunft. */
  hint: string;
  /** Plätze: eine Zelle je Grad. Zähler und Punkte: genau eine. */
  cells: { label: string; count: number }[];
}

/** Plätze zuerst — sie stehen am Tisch obenan und sind die breiteste Zeile. */
export function resourceViews(pools: ResolvedResource[]): ResourceView[] {
  return [...pools]
    .sort((a, b) => Number(b.kind === 'slots') - Number(a.kind === 'slots'))
    .map((pool) => ({
      id: pool.id,
      label: pool.labelDe,
      hint: [RECHARGE_DE[pool.recharge], ...pool.additions.map((a) => `+${a.amount} ${a.labelDe}`)]
        .filter(Boolean)
        .join(' · '),
      cells:
        pool.kind === 'slots'
          ? pool.max.flatMap((count, i) => (count > 0 ? [{ label: `Grad ${i + 1}`, count }] : []))
          : (pool.max[0] ?? 0) > 0
            ? [{ label: '', count: pool.max[0] }]
            : [],
    }))
    .filter((v) => v.cells.length > 0);
}

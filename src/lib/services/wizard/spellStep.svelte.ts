/**
 * Abgeleitete Werte des Zauber-Schritts. Rahmen (`done` fürs Gating) und Schritt-Komponente
 * lesen dieselbe Instanz, damit nichts doppelt gerechnet wird.
 */
import type { FeatureRider } from '$lib/schemas/levelUp';
import type { CharacterWizard } from './characterWizard.svelte';
import type { ClassCastingOffer } from '../spellcasting/classOffer';
import { validateRiderSpells } from '../levelUp/spells';
import { resolveSpell, type SpellInfo } from '../../spellLibrary';

/**
 * Kann nur wachsen, nie schrumpfen — deshalb darf die Oberfläche das Kontingent nachträglich
 * erhöhen, ohne getroffene Wahlen zu entwerten.
 */
const riderExtras = (riders: FeatureRider[]): { cantrips: number; prepared: number } =>
  riders.reduce(
    (acc, r) => ({ cantrips: acc.cantrips + r.extraCantrips, prepared: acc.prepared + r.extraPreparedCount }),
    { cantrips: 0, prepared: 0 },
  );

export interface SpellStepValues {
  readonly extras: { cantrips: number; prepared: number };
  readonly cantripMax: number;
  /** Im Zauberbuch-Regime die Buchgröße, sonst unmittelbar die Vorbereitung. */
  readonly spellMax: number;
  readonly preparedMax: number;
  readonly isSpellbook: boolean;
  /** true = die Vorbereitung erneuert sich frei nach jeder Langen Rast (Kleriker/Druide). */
  readonly isOpenList: boolean;
  /** Zaubergrade, für die auf Stufe 1 Plätze existieren (1 … maxSpellLevel). */
  readonly spellLevels: number[];
  readonly grantedSpells: { cantrips: string[]; prepared: { level: number; name: string }[] };
  readonly fixedCantrips: { level: number; name: string }[];
  readonly cantripPicks: string[];
  readonly knownPicks: string[];
  readonly done: boolean;
}

export function createSpellStepValues(
  w: CharacterWizard,
  offer: () => ClassCastingOffer | null,
  library: () => SpellInfo[],
): SpellStepValues {
  const extras = $derived(riderExtras(w.riders));
  const cantripMax = $derived((offer()?.cantrips?.count ?? 0) + extras.cantrips);
  const spellMax = $derived.by(() => (offer()?.spells?.count ?? 0) + extras.prepared);
  const preparedMax = $derived.by(() => {
    const prepared = offer()?.prepared;
    return prepared ? prepared.count + extras.prepared : 0;
  });
  const isSpellbook = $derived(!!offer()?.prepared);
  const isOpenList = $derived(offer()?.spells?.swap.spells === 'long-rest-all');
  const spellLevels = $derived([...(offer()?.spells?.levels.filter((l) => l > 0) ?? [])]);

  /** Von Merkmalen gewährte Zauber: fest, nicht entfernbar, zählen nicht gegen das Kontingent. */
  const grantedSpells = $derived.by(() => {
    const lib = library();
    if (!lib.length || !w.riders.length) return { cantrips: [], prepared: [] };
    const v = validateRiderSpells(w.riders, lib, w.klass.name);
    return { cantrips: v.grantedCantrips, prepared: v.grantedPrepared };
  });
  const fixedCantrips = $derived(grantedSpells.cantrips.map((name) => ({ level: 0, name })));

  // Ein selbst gewählter Zauber, der DANACH als gewährt hereinkommt (der Effekt-Job landet
  // spät), wird aus der Auswahl gefiltert statt doppelt zu erscheinen. Hier nichts mutieren —
  // beim nächsten Schreiben verschwindet er ohnehin aus dem Zustand.
  const grantedKeys = $derived.by(() => {
    const lib = library();
    const keyOf = (name: string) => resolveSpell(lib, name, w.klass.name)?.key;
    return {
      cantrips: new Set(grantedSpells.cantrips.map(keyOf).filter((k): k is string => !!k)),
      spells: new Set(grantedSpells.prepared.map((p) => keyOf(p.name)).filter((k): k is string => !!k)),
    };
  });
  const cantripPicks = $derived(w.pickedCantrips.filter((k) => !grantedKeys.cantrips.has(k)));
  const knownPicks = $derived(w.pickedKnown.filter((k) => !grantedKeys.spells.has(k)));

  /**
   * Gated nur gegen die DETERMINISTISCHEN Kontingente: der Effekt-Job läuft beim Betreten
   * womöglich noch, und sein nachträglicher Aufschlag darf den Nutzer nicht blockieren.
   */
  const done = $derived.by(() => {
    const base = offer();
    if (base?.isCaster) {
      if (cantripPicks.length < (base.cantrips?.count ?? 0)) return false;
      // Nur fordern, was auch wählbar ANGEBOTEN wird: eine Klasse mit „Prepared Spells"-Spalte
      // aber ohne Zauberplatz-Spalten (Homebrew-Lücke) würde den Wizard sonst blockieren.
      if (spellLevels.length > 0) {
        if (knownPicks.length < (base.spells?.count ?? 0)) return false;
        if (isSpellbook && w.pickedPrepared.length < (base.prepared?.count ?? 0)) return false;
      }
    }
    return w.spellPickChoices.every((c) => (w.featureSpellPicks[c.id] ?? []).length >= c.max);
  });

  return {
    get extras() { return extras; },
    get cantripMax() { return cantripMax; },
    get spellMax() { return spellMax; },
    get preparedMax() { return preparedMax; },
    get isSpellbook() { return isSpellbook; },
    get isOpenList() { return isOpenList; },
    get spellLevels() { return spellLevels; },
    get grantedSpells() { return grantedSpells; },
    get fixedCantrips() { return fixedCantrips; },
    get cantripPicks() { return cantripPicks; },
    get knownPicks() { return knownPicks; },
    get done() { return done; },
  };
}

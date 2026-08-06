/**
 * Abgeleitete Werte des Zauber-Schritts. Rahmen (`done` fürs Gating) und Schritt-Komponente
 * lesen dieselbe Instanz, damit nichts doppelt gerechnet wird.
 */
import type { FeatureRider } from '$lib/schemas/levelUp';
import type { CharacterWizard } from './characterWizard.svelte';
import { spellStepDone, spellStepRows, type SpellStepRow } from './spellRows';
import { validateRiderSpells } from '../levelUp/spells';
import { groupedSpellcasting, type GroupedSpellcasting } from '../spellcasting/grouped';
import type { FormCasting } from '../characterFormCasting.svelte';
import type { AnalysisChoice } from '../analysis/types';
import type { SpellInfo } from '../../spellLibrary';

/**
 * Was kein Kontingent zählt: die Deklaration eines Merkmals gewinnt (`optionListRider`
 * streicht, was seine Quota schon führt), übrig bleibt die Deutung der KI.
 */
const uncoveredExtras = (riders: FeatureRider[]): number =>
  riders.reduce((n, r) => n + r.extraCantrips + r.extraPreparedCount, 0);

export interface SpellStepValues {
  /** null, solange die Auflösung lädt oder fehlschlug. */
  readonly view: GroupedSpellcasting | null;
  readonly rows: SpellStepRow[];
  /** Von einem Merkmal gewährt: fest, nicht wählbar, ohne Kontingent. */
  readonly granted: { level: number; name: string }[];
  /** Freie Zauber ohne Kontingent — quellenloser Bestand. */
  readonly extraMax: number;
  /** `spell-pick`-Wahlen, denen keine Deklaration eine Quota mitgibt. */
  readonly loose: AnalysisChoice[];
  /** Der Grund einer fehlgeschlagenen Auflösung; ohne ihn fiele der Schritt still weg. */
  readonly error: string;
  readonly done: boolean;
}

export function createSpellStepValues(
  w: CharacterWizard,
  casting: FormCasting,
  library: () => SpellInfo[],
): SpellStepValues {
  const view = $derived.by(() => {
    const loaded = casting.current;
    return loaded ? groupedSpellcasting(loaded.state, loaded.lookup) : null;
  });
  const rows = $derived(view ? spellStepRows(view) : []);

  const granted = $derived.by(() => {
    const lib = library();
    if (!lib.length || !w.riders.length) return [];
    const v = validateRiderSpells(w.riders, lib, w.klass.name);
    return [...v.grantedCantrips.map((name) => ({ level: 0, name })), ...v.grantedPrepared];
  });
  const extraMax = $derived(uncoveredExtras(w.riders));
  const loose = $derived(w.spellPickChoices.filter((c) => !(c.sourceId && c.quotaId)));

  /**
   * Nur die Kontingente und die offenen KI-Wahlen: `extraMax` wächst mit dem Effekt-Job, der
   * beim Betreten womöglich noch läuft, und dürfte den Nutzer nicht blockieren. Eine
   * fehlgeschlagene Auflösung hat keine Zeilen und hält den Wizard deshalb nicht an.
   */
  const done = $derived(
    spellStepDone(rows) && loose.every((c) => (w.featureSpellPicks[c.id] ?? []).length >= c.max),
  );

  return {
    get view() { return view; },
    get rows() { return rows; },
    get granted() { return granted; },
    get extraMax() { return extraMax; },
    get loose() { return loose; },
    get error() { return casting.error; },
    get done() { return done; },
  };
}

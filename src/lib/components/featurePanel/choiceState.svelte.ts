/**
 * Die deklarierten Merkmalswahlen eines Charakters als reaktive Sicht: welche es gibt, was
 * sie bewirken, und welche Ledger-Einträge zu keinem Wahl-Platz gehören.
 */
import type { Character } from '$lib/schemas/characterSchema';
import {
  buildCharacterChoices, choiceGrantChanges, openChoiceBadge, sheetSkillProficiencies,
  type CharacterChoice, type ChoiceGrants, type ChoiceSlot,
} from '$lib/services/characterChoices';
import { changesWouldAlter, type ApplyContext } from '$lib/services/applyChanges';
import type { CoverageBadge } from '$lib/services/declarationCoverage';
import type { LedgerRow } from '$lib/services/featureLedger';
import { getSpellLibrary, type SpellInfo } from '$lib/spellLibrary';
import { classifyChange, type DiffDir } from '$lib/utils/diffHighlight';

/** `i` ist der Index in `ChoiceState.grants` — beide Listen sind index-gleich. */
export interface ChoiceRow {
  ch: CharacterChoice;
  i: number;
}

export type ChoiceGrantsView = ChoiceGrants & { wouldAlter: boolean };

export interface ChoiceState {
  readonly grants: ChoiceGrantsView[];
  readonly badge: CoverageBadge | null;
  readonly openCount: number;
  /** Wahl-Einträge ohne Platz UND ohne Merkmal am Charakter. */
  readonly orphans: LedgerRow[];
  slotsOf(key: string): ChoiceRow[];
  /** Antworten an einem Merkmal OHNE Wahl-Platz (KI-gedeutet, keine Optionen deklariert). */
  looseOf(key: string): LedgerRow[];
  /** Offene Wahlen unter diesen Keys — der Marker am zugeklappten Abschnitt. */
  openIn(keys: Iterable<string>): number;
  answerDiff(ch: CharacterChoice): DiffDir;
}

export function createChoiceState(o: {
  character: () => Character;
  /** Baseline des Diff-Highlightings. */
  saved: () => Character | null;
  slots: () => ChoiceSlot[];
  /** Keys aller Merkmale, die der Charakter überhaupt hat. */
  knownKeys: () => string[];
  /**
   * Der Kontext des Editors, nicht ein eigener: „✓ übernommen" ist die Aussage, dass ein
   * erneutes `apply` nichts täte — mit einem zweiten Kontext wäre sie über jeden Grant
   * falsch, dessen Ziel von einem Auflöser abhängt (`resolveWeaponName`).
   */
  ctx: () => ApplyContext;
}): ChoiceState {
  // Die Expertise-Optionen sind der LIVE-Übungsstand aus dem Draft, nicht aus dem Formular:
  // sonst bliebe die Wahl tot, solange das Bearbeiten-Formular nicht montiert ist.
  const all = $derived(
    buildCharacterChoices(o.slots(), {
      proficient: sheetSkillProficiencies(o.character().skills).prof,
      ledger: o.character().features,
    }),
  );

  const byFeature = $derived.by(() => {
    const map = new Map<string, ChoiceRow[]>();
    all.forEach((ch, i) => {
      const key = ch.slot.feature.key ?? '';
      if (!key) return;
      map.set(key, [...(map.get(key) ?? []), { ch, i }]);
    });
    return map;
  });

  let spellLibrary = $state<SpellInfo[]>([]);
  $effect(() => { getSpellLibrary().then((lib) => { spellLibrary = lib; }); });

  const grants = $derived.by<ChoiceGrantsView[]>(() => {
    // Erst mit geladener Zauberbibliothek: davor wäre JEDER Options-Zauber „nicht gefunden",
    // und der Picker meldete eine Lücke, die es nicht gibt.
    if (!spellLibrary.length) return [];
    const snap = $state.snapshot(o.character()) as Character;
    const ctx = o.ctx();
    return all.map((ch) => {
      const g = choiceGrantChanges(ch, spellLibrary);
      return { ...g, wouldAlter: changesWouldAlter(snap, g.changes, ctx) };
    });
  });

  const savedChoiceEntries = $derived((o.saved()?.features ?? []).filter((r) => !!r.choice?.trim()));
  function savedAnswerOf(ch: CharacterChoice): string {
    const key = ch.slot.feature.key ?? '';
    const hit =
      savedChoiceEntries.find((e) => e.sourceKey === key && e.gainedAt === ch.slot.gainedAt) ??
      // Altbestand trägt kein `gainedAt` — dieselbe Nachsicht wie `buildCharacterChoices`.
      savedChoiceEntries.find((e) => e.sourceKey === key && e.gainedAt == null);
    return hit?.choice ?? '';
  }

  const claimed = $derived(new Set(all.map((c) => c.entry).filter((i) => i >= 0)));

  // Je EINZELNER Eintrag statt zusammengefasst: ein mehrfach vergebenes Merkmal hat mehrere,
  // und jede Zeile braucht ihren Ledger-Index zum Löschen.
  const loose = $derived.by(() => {
    const map = new Map<string, LedgerRow[]>();
    o.character().features.forEach((e, i) => {
      if (!e.choice.trim() || claimed.has(i) || !e.sourceKey) return;
      map.set(e.sourceKey, [...(map.get(e.sourceKey) ?? []), { e, i }]);
    });
    return map;
  });

  // Verwaist = beides zugleich: kein Platz hat den Eintrag beansprucht UND der Key gehört zu
  // keinem Merkmal. Die erste Bedingung allein reicht nicht — eine Wahl an einem Merkmal
  // ohne `grantsChoice` hat nie einen Platz.
  const orphans = $derived.by(() => {
    const known = new Set(o.knownKeys());
    return o
      .character()
      .features.map((e, i) => ({ e, i }))
      .filter(({ e, i }) => !!e.choice.trim() && !claimed.has(i) && !known.has(e.sourceKey));
  });

  const badge = $derived(openChoiceBadge(all));
  const openCount = $derived(all.filter((c) => c.open).length);

  return {
    get grants() { return grants; },
    get badge() { return badge; },
    get openCount() { return openCount; },
    get orphans() { return orphans; },
    slotsOf: (key) => byFeature.get(key) ?? [],
    looseOf: (key) => loose.get(key) ?? [],
    openIn(keys) {
      const set = new Set(keys);
      return all.filter((c) => c.open && set.has(c.slot.feature.key ?? '')).length;
    },
    answerDiff(ch) {
      return o.saved() ? classifyChange(savedAnswerOf(ch), ch.answer.join(', ')) : 'none';
    },
  };
}

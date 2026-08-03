/**
 * Der einzige Schreibpfad auf `character.features`. Jede Bedienung der Merkmalsleiste geht
 * hier durch, und genau das ist das Dirty-Signal der Save-Bar.
 */
import type { Character, CharacterFeatureEntry } from '$lib/schemas/characterSchema';
import { withChoiceAnswer, type CharacterChoice } from './characterChoices';

/** Ein Eintrag mit seinem ECHTEN Ledger-Index — Ändern und Löschen brauchen ihn. */
export interface LedgerRow {
  e: CharacterFeatureEntry;
  i: number;
}

export interface FeatureLedger {
  append(entry: CharacterFeatureEntry): void;
  update(i: number, patch: Partial<CharacterFeatureEntry>): void;
  remove(i: number): void;
  answer(ch: CharacterChoice, next: readonly string[]): void;
}

/**
 * Geschrieben wird immer die ganze Liste, immer an der VORHANDENEN Position: eine
 * Umsortierung machte den Charakter beim bloßen Öffnen dirty, denn die Leiste ist immer
 * montiert. `target` ist ein Getter, weil „Übernehmen" den Draft per NEUER Referenz ersetzt.
 */
export function createFeatureLedger(target: () => Character): FeatureLedger {
  const write = (next: CharacterFeatureEntry[]) => {
    target().features = next;
  };
  return {
    append(entry) {
      write([...target().features, entry]);
    },
    update(i, patch) {
      write(target().features.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    },
    remove(i) {
      write(target().features.filter((_, j) => j !== i));
    },
    answer(ch, next) {
      write(withChoiceAnswer(target().features, ch, next));
    },
  };
}

/** Talent-Links: `choice` ist der Diskriminator „Wahl-Eintrag vs. Talent-Link". */
export function featLinkRows(features: CharacterFeatureEntry[]): LedgerRow[] {
  return features.map((e, i) => ({ e, i })).filter(({ e }) => !e.choice.trim());
}

/**
 * Talentwahlen, die ein Aufstieg freischaltet — neben den neu erhaltenen Merkmalen auch die
 * bedingten (`when`), deren Antwort erst in DIESEM Aufstieg fällt (Lektionen der Ersten als
 * Pool-Wahl, der Talent-Zweig des Paladin-Kampfstils).
 */
import type { ClassFeature } from '../../schemas/classProgression';
import type { OptionPick } from '../../schemas/characterSchema';
import type { FeatCategory } from '../../schemas/vocabulary';
import { choiceActive, choiceBranchState } from '../declaration/branch';
import type { LedgerAnswerEntry } from '../declaration/ledgerAnswers';
import { choiceGrants } from '../declaration/source';
import { FIGHTING_STYLE_CATEGORY, type FightingStyleOption } from '../fightingStyle';

export interface UnlockState {
  ledger: readonly LedgerAnswerEntry[];
  picks: readonly OptionPick[];
}

/** Talentwahl, die auf eine Kategorie beschränkt ist. */
export interface CategorySlot {
  category: FeatCategory;
  count: number;
}

export const slotTotal = (slots: readonly CategorySlot[]): number => slots.reduce((n, s) => n + s.count, 0);

function addSlot(slots: CategorySlot[], category: FeatCategory, count: number): void {
  const slot = slots.find((s) => s.category === category);
  if (slot) slot.count += count;
  else slots.push({ category, count });
}

export interface FeatUnlocks {
  /** Neue Kampfstile, bedingt oder nicht. */
  fightingStyle: number;
  /** Bedingte Wahlen anderer Kategorien; die unbedingten zählt `countFeatsToPick` am Delta. */
  conditional: CategorySlot[];
  /** Vorhandene Kampfstile, die dieser Aufstieg tauschen darf (`swap: 'level-up-one'`). */
  styleSwaps: number;
}

/** `features`: alle Klassen- und Subklassenmerkmale bis zur Zielstufe. */
export function featUnlocks(
  features: readonly ClassFeature[],
  span: { fromLevel: number; toLevel: number },
  before: UnlockState,
  after: UnlockState,
): FeatUnlocks {
  const out: FeatUnlocks = { fightingStyle: 0, conditional: [], styleSwaps: 0 };
  for (const f of features) {
    if (!f.gainedAt.length) continue;
    const first = Math.min(...f.gainedAt);
    if (first > span.toLevel) continue;
    const had = first <= span.fromLevel;
    const was = choiceBranchState(f, before.ledger, before.picks);
    const now = choiceBranchState(f, after.ledger, after.picks);
    const timesInSpan = f.gainedAt.filter((l) => l > span.fromLevel && l <= span.toLevel).length;
    for (const g of choiceGrants(f)) {
      if (g.kind !== 'featCategory') continue;
      const style = g.featCategory === FIGHTING_STYLE_CATEGORY;
      if (style && g.swap === 'level-up-one' && had && choiceActive(g, was)) out.styleSwaps += g.count;
      if (!g.when) {
        if (style) out.fightingStyle += timesInSpan * g.count;
        continue;
      }
      if (!choiceActive(g, now) || (had && choiceActive(g, was))) continue;
      if (style) out.fightingStyle += g.count;
      else if (g.featCategory) addSlot(out.conditional, g.featCategory, g.count);
    }
  }
  return out;
}

/** Der Kampfstil-Teil des Talent-Checkpoints. */
export interface LevelUpStyleOffer {
  allowance: number;
  swaps: number;
  /** Alle der Kategorie; was davon wählbar ist, entscheidet `pickableFeats` gegen `ownedFeats`. */
  options: FightingStyleOption[];
  /** Vorhandene Kampfstil-Links, die ein Tausch ersetzen kann. */
  owned: FightingStyleOption[];
}

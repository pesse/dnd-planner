/**
 * Kampfstil-Angebot, Bauform wie `weaponMastery.ts` (schmale Eingabe, Optionen aus der
 * Bibliothek statt aus der KI). Unterschied ist allein die Speicherung: ein Kampfstil ist ein
 * echtes Talent, also ein LINK in `character.features[]`, kein Name in einem String-Array.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { FeatureChoiceGrant } from '$lib/schemas/featureChoice';
import type { FeatCategory } from '$lib/schemas/vocabulary';
import type { OptionPick } from '$lib/schemas/characterSchema';
import { choiceGrants } from './declaration/source';
import { choiceActive, choiceBranchState, type BranchState } from './declaration/branch';
import type { LedgerAnswerEntry } from './declaration/ledgerAnswers';
import { featuresUpTo, getProgressionByKey } from './classProgression';
import { getFeats, featDisplayName, featDesc, featPrereq, type FeatEntry } from '$lib/featsLibrary';

export const FIGHTING_STYLE_CATEGORY: FeatCategory = 'Fighting Style';

const fightingStyleGrants = (f: ClassFeature, state: BranchState): FeatureChoiceGrant[] =>
  choiceGrants(f).filter(
    (g) => g.kind === 'featCategory' && g.featCategory === FIGHTING_STYLE_CATEGORY && choiceActive(g, state),
  );

export interface FightingStyleOption {
  /** Landet als `sourceKey` im Merkmals-Ledger des Charakters. */
  sourceKey: string;
  name: string;
  desc: string;
  repeatable: boolean;
}

/** Subklasse inklusive — der „Zusätzliche Kampfstil" des Champions ist ein Subklassen-Merkmal. */
export interface FightingStyleInput {
  classes?: { sourceKey?: string; subclassKey?: string; name?: string; level?: number }[];
  /** Merkmals-Ledger und Pool-Wahlen: eine Talentwahl mit `when` zählt erst nach ihrer Antwort. */
  features?: readonly LedgerAnswerEntry[];
  optionPicks?: readonly OptionPick[];
}

export interface FightingStyleOffer {
  allowance: number;
  /** Bei Multiclass „Kämpfer / Paladin". */
  className: string;
  options: FightingStyleOption[];
}

const emptyOffer = (): FightingStyleOffer => ({ allowance: 0, className: '', options: [] });

function styleCountUpTo(prog: ClassProgression, level: number, input: FightingStyleInput): number {
  return featuresUpTo(prog, level)
    .flatMap((f) => fightingStyleGrants(f, choiceBranchState(f, input.features ?? [], input.optionPicks ?? [])))
    .reduce((sum, g) => sum + g.count, 0);
}

/**
 * ANDERS als bei der Waffenbeherrschung zählt nicht nur `classes[0]`: einen Kampfstil gewährt
 * jede Klasse eigenständig, das Kontingent summiert über alle. Die Optionsliste ist bewusst
 * NICHT gefiltert — ein Kampfstil hat keine Übungs-Voraussetzung.
 */
export async function fightingStyleOffer(input: FightingStyleInput): Promise<FightingStyleOffer> {
  const classes = input.classes?.filter((c) => c?.sourceKey) ?? [];
  if (!classes.length) return emptyOffer();

  let allowance = 0;
  const classNames: string[] = [];
  for (const c of classes) {
    const level = Math.min(20, Math.max(1, c.level ?? 1));
    const [prog, subProg] = await Promise.all([
      getProgressionByKey(c.sourceKey!),
      c.subclassKey ? getProgressionByKey(c.subclassKey) : Promise.resolve(null),
    ]);
    if (!prog) continue;
    const n = styleCountUpTo(prog, level, input) + (subProg ? styleCountUpTo(subProg, level, input) : 0);
    if (n > 0) {
      allowance += n;
      const label = c.name?.trim() || prog.nameDe || prog.name;
      if (label && !classNames.includes(label)) classNames.push(label);
    }
  }
  if (allowance <= 0) return emptyOffer();

  return { allowance, className: classNames.join(' / '), options: await fightingStyleOptions() };
}

export const featCategoryOptions = (feats: readonly FeatEntry[], category: FeatCategory): FightingStyleOption[] =>
  feats
    .filter((f) => f.category === category && f.sourceKey)
    .map((f) => ({ sourceKey: f.sourceKey!, name: featDisplayName(f), desc: featDesc(f) || featPrereq(f), repeatable: !!f.repeatable }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

/** Was ein Charakter mit `owned` noch nehmen darf: Neues und Wiederholbares. */
export const pickableFeats = (options: readonly FightingStyleOption[], owned: readonly string[]): FightingStyleOption[] =>
  options.filter((o) => o.repeatable || !owned.includes(o.sourceKey));

export async function fightingStyleOptions(): Promise<FightingStyleOption[]> {
  return featCategoryOptions(await getFeats(), FIGHTING_STYLE_CATEGORY);
}

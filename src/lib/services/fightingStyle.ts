/**
 * Kampfstil-Angebot, Bauform wie `weaponMastery.ts` (schmale Eingabe, Optionen aus der
 * Bibliothek statt aus der KI). Unterschied ist allein die Speicherung: ein Kampfstil ist ein
 * echtes Talent, also ein LINK in `character.features[]`, kein Name in einem String-Array.
 */
import type { ClassFeature, ClassProgression } from '$lib/schemas/classProgression';
import type { FeatureChoiceGrant } from '$lib/schemas/featureChoice';
import type { FeatCategory } from '$lib/schemas/vocabulary';
import { choiceGrants } from './declaration/source';
import { featuresUpTo, getProgressionByKey } from './classProgression';
import { getFeats, featDisplayName, featDesc, featPrereq } from '$lib/featsLibrary';

const FIGHTING_STYLE_CATEGORY: FeatCategory = 'Fighting Style';

/** Rein deklarativ, damit Homebrew mit derselben Deklaration genauso behandelt wird. */
export function isFightingStyleFeature(f: ClassFeature): boolean {
  return fightingStyleGrants(f).length > 0;
}

const fightingStyleGrants = (f: ClassFeature): FeatureChoiceGrant[] =>
  choiceGrants(f).filter((g) => g.kind === 'featCategory' && g.featCategory === FIGHTING_STYLE_CATEGORY);

export interface FightingStyleOption {
  /** Landet als `sourceKey` im Merkmals-Ledger des Charakters. */
  sourceKey: string;
  name: string;
  desc: string;
}

/** Subklasse inklusive — der „Zusätzliche Kampfstil" des Champions ist ein Subklassen-Merkmal. */
export interface FightingStyleInput {
  classes?: { sourceKey?: string; subclassKey?: string; name?: string; level?: number }[];
}

export interface FightingStyleOffer {
  allowance: number;
  /** Bei Multiclass „Kämpfer / Paladin". */
  className: string;
  options: FightingStyleOption[];
}

const emptyOffer = (): FightingStyleOffer => ({ allowance: 0, className: '', options: [] });

function styleCountUpTo(prog: ClassProgression, level: number): number {
  return featuresUpTo(prog, level)
    .flatMap(fightingStyleGrants)
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
    const n = styleCountUpTo(prog, level) + (subProg ? styleCountUpTo(subProg, level) : 0);
    if (n > 0) {
      allowance += n;
      const label = c.name?.trim() || prog.nameDe || prog.name;
      if (label && !classNames.includes(label)) classNames.push(label);
    }
  }
  if (allowance <= 0) return emptyOffer();

  const options: FightingStyleOption[] = (await getFeats())
    .filter((f) => f.category === FIGHTING_STYLE_CATEGORY && f.sourceKey)
    .map((f) => ({ sourceKey: f.sourceKey!, name: featDisplayName(f), desc: featDesc(f) || featPrereq(f) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return { allowance, className: classNames.join(' / '), options };
}

/**
 * Die Größe aus dem „Size"-Merkmal — der FALLBACK für Spezies ohne Deklaration; ein
 * redigiertes Merkmal führt seine Größe über `characterProperties.ts`, und `sizeChoiceOf`
 * fragt dann nicht ein zweites Mal. `speciesSchema.size` wäre die naheliegende Quelle, ist
 * aber im ganzen Bestand leer: v2 liefert die Größe nur als Merkmalstext. Gelesen wird
 * deshalb der ENGLISCHE Text gegen das Kreaturen-Vokabular, deutsch erst beim Schreiben.
 */
import { MONSTER_SIZES, MONSTER_SIZE_KEYS, type MonsterSize } from '$lib/types';
import { declaredChoice } from './declaredChoice';
import { isRedacted, type DeclarableFeature } from './declarationCoverage';
import type { AnalysisChoice } from './analysis/types';

/** Kreaturengröße ist EIN Vokabular; die Tabelle heißt historisch `MONSTER_SIZES`. */
export type SizeCategory = MonsterSize;
const SIZE_CATEGORIES: readonly SizeCategory[] = MONSTER_SIZE_KEYS;

export interface SizeTraitSource {
  key?: string;
  name: string;
  nameDe?: string;
  desc?: string;
  grants?: DeclarableFeature['grants'];
  grantsChoice?: DeclarableFeature['grantsChoice'];
  grantsSpells?: DeclarableFeature['grantsSpells'];
}

/** Am Namen, wie bei der Bewegungsrate — auch die zwei ohne Diskriminator müssen mit. */
export function sizeTraitOf<T extends SizeTraitSource>(traits: T[]): T | undefined {
  return traits.find((t) => /(_size$|^size$)/i.test(t.key ?? '') || t.name.toLowerCase() === 'size');
}

/** Die genannten Kategorien in Textreihenfolge; zwei bedeuten eine Wahl, keine bedeutet: nichts raten. */
export function sizeOptionsOf(traits: SizeTraitSource[]): SizeCategory[] {
  const desc = sizeTraitOf(traits)?.desc ?? '';
  return SIZE_CATEGORIES.map((c) => ({ c, at: desc.search(new RegExp(`\\b${c}\\b`)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.c);
}

/** Deutsches Anzeigelabel; keine neue Tabelle, das Vokabular hat schon eine. */
export const sizeLabel = (size: SizeCategory): string => MONSTER_SIZES[size];

const slug = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const sizeChoiceId = (speciesKey: string): string => `speciessize_${slug(speciesKey)}`;

/**
 * Nur bei zwei zugelassenen Kategorien, sonst null. Ein REDIGIERTES Größenmerkmal liefert
 * hier gar nichts: seine Wahl führt der Eigenschafts-Pfad, sonst wird zweimal gefragt.
 */
export function sizeChoiceOf(species: { key: string; traits: SizeTraitSource[] } | null): AnalysisChoice | null {
  if (!species) return null;
  const trait = sizeTraitOf(species.traits);
  if (trait && isRedacted(trait)) return null;
  const options = sizeOptionsOf(species.traits);
  if (options.length < 2) return null;

  return {
    ...declaredChoice({
      id: sizeChoiceId(species.key),
      feature: trait?.name || 'Size',
      featureDe: trait?.nameDe || 'Größe',
      featureKey: trait?.key ?? '',
    }),
    question: 'Which size category?',
    questionDe: 'Größenkategorie',
    options,
    optionsDe: options.map(sizeLabel),
    helpDe: 'Bestimmt die Größenkategorie auf dem Bogen.',
    // Der Wert steht danach in `personal.sizeCat` — ein Ledger-Eintrag wäre eine zweite Wahrheit.
    isBuildDecision: false,
  };
}

/** Ohne Antwort leer — das Feld ist editierbar, geraten wäre schlimmer als leer. */
export function resolveSizeCat(traits: SizeTraitSource[], answer = ''): string {
  const options = sizeOptionsOf(traits);
  if (options.length === 1) return sizeLabel(options[0]);
  const picked = options.find((o) => o.toLowerCase() === answer.trim().toLowerCase());
  return picked ? sizeLabel(picked) : '';
}

/**
 * Die Größenkategorie des Charakters aus dem „Size"-Merkmal der Spezies — der FALLBACK für
 * Merkmale ohne Deklaration.
 *
 * Die Deklaration gewinnt: ein redigiertes Merkmal trägt seine Größe als `grants.properties`
 * bzw. als `grantsChoice.kind === 'characterProperty'` (services/characterProperties.ts), und
 * dann stellt `sizeChoiceOf` hier keine zweite Frage. Übrig bleibt dieser Weg für Homebrew und
 * frische Open5e-Importe — dasselbe Muster wie der Namens-Fallback bei `isWeaponMasteryFeature`.
 *
 * `speciesSchema.size` wäre die naheliegende Quelle, ist aber im ganzen Bestand leer: Open5e v2
 * liefert die Größe nur als Merkmalstext. Gelesen wird deshalb der Text, und zwar der ENGLISCHE
 * gegen das geschlossene Kreaturen-Vokabular; deutsch wird er erst beim Schreiben.
 *
 * Zwei genannte Kategorien heißen: der Spieler wählt (Mensch, Tiefling). Deshalb tragen genau
 * diese Merkmale keinen `sheetValue`-Diskriminator und bleiben im KI-Eingang.
 */
import { MONSTER_SIZES, MONSTER_SIZE_KEYS, type MonsterSize } from '$lib/types';
import { declaredChoice } from './declaredChoice';
import { isRedacted, type DeclarableFeature } from './declarationCoverage';
import type { AnalysisChoice } from './aiActions/featureEffectsAction';

/** Kreaturengröße ist EIN Vokabular; die Tabelle heißt historisch `MONSTER_SIZES`. */
export type SizeCategory = MonsterSize;
const SIZE_CATEGORIES: readonly SizeCategory[] = MONSTER_SIZE_KEYS;

/** Strukturelles Minimum: ein Speziesmerkmal, wie die Bibliothek es liefert. */
export interface SizeTraitSource {
  key?: string;
  name: string;
  nameDe?: string;
  desc?: string;
  grants?: DeclarableFeature['grants'];
  grantsChoice?: DeclarableFeature['grantsChoice'];
  grantsSpells?: DeclarableFeature['grantsSpells'];
}

/** Das Größenmerkmal — am Namen, wie schon bei der Bewegungsrate: es müssen ALLE gefunden
 *  werden, auch die zwei ohne Diskriminator. */
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
 * Die Wahl, falls die Spezies zwei Kategorien zulässt — sonst null (dann steht der Wert fest).
 *
 * Ein REDIGIERTES Größenmerkmal liefert hier nichts mehr: seine Wahl führt der generische
 * Eigenschafts-Pfad, und beide zusammen fragten dieselbe Größe zweimal.
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
    help: 'Sets the size category on the sheet.',
    helpDe: 'Bestimmt die Größenkategorie auf dem Bogen.',
    // Der Wert steht danach in `personal.sizeCat` — ein Ledger-Eintrag wäre eine zweite Wahrheit.
    isBuildDecision: false,
  };
}

/**
 * Der Bogenwert (deutsch): bei einer Kategorie fest, bei mehreren die Antwort auf die Wahl.
 * Ohne Antwort leer — das Feld ist editierbar, geraten wäre schlimmer als leer.
 */
export function resolveSizeCat(traits: SizeTraitSource[], answer = ''): string {
  const options = sizeOptionsOf(traits);
  if (options.length === 1) return sizeLabel(options[0]);
  const picked = options.find((o) => o.toLowerCase() === answer.trim().toLowerCase());
  return picked ? sizeLabel(picked) : '';
}

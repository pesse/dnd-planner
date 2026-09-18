/**
 * Die Attributsverbesserung der Stufentabelle als EINE Wahl. Kodiert ist sie als Liste der
 * +1-Schritte (`['con','con']` = +2 KON, `['str','dex']` = +1/+1), `['feat']` steht für das
 * Talent — beide Senken, Talentzähler und Änderungsbau, lesen sie über `readAsiPick`.
 */
import { ABILITY_KEYS, type AbilityKey } from '../../schemas/abilities';

/** Die Stufentabelle deckelt bei 20; darüber hinaus hebt nur ein Merkmal, das es ausspricht. */
export const ASI_ABILITY_MAX = 20;

export const ASI_FEAT_VALUE = 'feat';

export const asiQuestionId = (i: number): string => `asi_or_feat_${i}`;

export type AsiPick =
  | { kind: 'feat' }
  | { kind: 'abilities'; abilities: AbilityKey[] };

const isAbility = (v: unknown): v is AbilityKey =>
  typeof v === 'string' && (ABILITY_KEYS as readonly string[]).includes(v);

/** Unvollständig beantwortet (Modus gewählt, Attribut noch offen) ergibt `null`, nicht „Talent". */
export function readAsiPick(answer: string | string[] | undefined): AsiPick | null {
  const vals = Array.isArray(answer) ? answer : answer ? [answer] : [];
  if (vals.includes(ASI_FEAT_VALUE)) return { kind: 'feat' };
  const abilities = vals.filter(isAbility);
  return abilities.length ? { kind: 'abilities', abilities } : null;
}

/** Wie oft jedes Attribut in der Antwort steht — genau das ist die Erhöhung. */
export function asiIncrements(answer: string | string[] | undefined): { ability: AbilityKey; value: number }[] {
  const pick = readAsiPick(answer);
  if (pick?.kind !== 'abilities') return [];
  return ABILITY_KEYS
    .map((ability) => ({ ability, value: pick.abilities.filter((a) => a === ability).length }))
    .filter((inc) => inc.value > 0);
}

export type AsiMode = 'plus2' | 'split' | 'feat';

/** Der Rückweg aus einer Antwort in die Bedienform — `''`, solange keine dasteht. */
export function asiModeOf(answer: string | string[] | undefined): AsiMode | '' {
  const pick = readAsiPick(answer);
  if (pick?.kind === 'feat') return 'feat';
  if (pick?.kind !== 'abilities') return '';
  return pick.abilities.length > 1 && pick.abilities[0] !== pick.abilities[1] ? 'split' : 'plus2';
}

/** Nur eine VOLLSTÄNDIGE Wahl wird zur Antwort — halb beantwortet hält den Checkpoint. */
export function asiAnswer(mode: AsiMode | '', first: string, second: string): string[] {
  if (mode === 'feat') return [ASI_FEAT_VALUE];
  if (mode === 'plus2') return first ? [first, first] : [];
  if (mode === 'split') return first && second && first !== second ? [first, second] : [];
  return [];
}

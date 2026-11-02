/** Der Verlauf des Detailfensters als unveränderlicher Stapel; ganz unten liegt immer die Übersicht. */
import type { FileEntry } from '../../types';

export type MapDetail =
  | { kind: 'overview' }
  | { kind: 'token'; id: string }
  | { kind: 'encounter'; key: string }
  | { kind: 'entry'; entry: FileEntry };

export type DetailStack = readonly MapDetail[];

const HISTORY_LIMIT = 30;

export const OVERVIEW_ONLY: DetailStack = [{ kind: 'overview' }];

const sameDetail = (a: MapDetail, b: MapDetail): boolean =>
  a.kind === b.kind &&
  (a.kind === 'overview' ||
    (a.kind === 'token' && a.id === (b as typeof a).id) ||
    (a.kind === 'encounter' && a.key === (b as typeof a).key) ||
    (a.kind === 'entry' && a.entry.path === (b as typeof a).entry.path));

export function pushDetail(stack: DetailStack, detail: MapDetail): DetailStack {
  if (sameDetail(stack[stack.length - 1], detail)) return stack;
  const next = [...stack, detail];
  return next.length > HISTORY_LIMIT ? [...OVERVIEW_ONLY, ...next.slice(-HISTORY_LIMIT + 1)] : next;
}

export const popDetail = (stack: DetailStack): DetailStack => (stack.length > 1 ? stack.slice(0, -1) : stack);

/** Ein gelöschtes Token darf beim Zurückgehen nicht wieder auftauchen. */
export function forgetToken(stack: DetailStack, tokenId: string): DetailStack {
  const kept = stack.filter((d) => !(d.kind === 'token' && d.id === tokenId));
  const collapsed = kept.filter((d, i) => i === 0 || !sameDetail(d, kept[i - 1]));
  return collapsed.length ? collapsed : OVERVIEW_ONLY;
}

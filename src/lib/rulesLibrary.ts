/** Lese-Index der Regelbegriffe (Regelglossare aller Quellen, flach). */
import { createLibrary, type LibraryEntry } from './services/library/createLibrary';
import { memoOnce } from './services/library/memo';
import { normalizeRule } from './utils/schemaValidation';
import type { Rule } from './schemas/rule';

export const RULES_PATH = './vault/rules';

export type RuleInfo = Rule & LibraryEntry;

export function ruleDisplayName(r: Pick<Rule, 'name' | 'nameDe'>): string {
  return r.nameDe || r.name;
}

export function ruleText(r: Pick<Rule, 'desc' | 'descDe'>): string {
  return r.descDe || r.desc;
}

// Die Dateien sind klein und jeder Leser braucht den Text — der Index trägt deshalb alles.
const library = createLibrary<RuleInfo>({
  path: RULES_PATH,
  displayName: ruleDisplayName,
  key: (r) => r.key,
  read: (raw, { path }) => ({ ...normalizeRule(raw), path }),
});

const byKey = memoOnce(async () => new Map((await library.list()).map((r) => [r.key, r])));

export const getRules = library.list;
export const searchRuleEntries = library.search;

export async function getRuleByKey(key: string): Promise<RuleInfo | undefined> {
  return (await byKey.get()).get(key);
}

export function invalidateRulesCache(): void {
  library.invalidate();
  byKey.invalidate();
}

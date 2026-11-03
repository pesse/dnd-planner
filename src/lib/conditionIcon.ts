import { CONDITION_KEYS, type Condition } from './schemas/vocabulary';
import type { Rule } from './schemas/rule';
import { keySlug } from './utils/text';

export const conditionIconUrl = (c: Condition): string => `/branding/conditions/${c}.webp`;

/** Der Glossareintrag eines Zustands zeigt dasselbe Icon wie die Kampfkarte. */
export function ruleIconUrl(rule: Pick<Rule, 'key' | 'category'>): string | null {
  const slug = keySlug(rule.key);
  return rule.category === 'condition' && (CONDITION_KEYS as readonly string[]).includes(slug) ? conditionIconUrl(slug as Condition) : null;
}

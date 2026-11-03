import { CONDITION_KEYS, type Condition } from './schemas/vocabulary';
import { TOKEN_EFFECT_KEYS, type TokenEffect } from './schemas/battleMap';
import type { Rule } from './schemas/rule';
import { keySlug } from './utils/text';

export type Badge = Condition | TokenEffect;
export const BADGE_KEYS: readonly Badge[] = [...CONDITION_KEYS, ...TOKEN_EFFECT_KEYS];
const BADGES: readonly string[] = BADGE_KEYS;

export const badgeIconUrl = (b: Badge): string => `/branding/conditions/${b}.webp`;

/** Der Glossareintrag eines Zustands oder Effekts zeigt dasselbe Icon wie die Kampfkarte. */
export function ruleIconUrl(rule: Pick<Rule, 'key'>): string | null {
  const slug = keySlug(rule.key);
  return BADGES.includes(slug) ? badgeIconUrl(slug as Badge) : null;
}

/** Im selben Stil wie die Zustände, aber kein Abzeichen am Token: das Token selbst ist die Falle. */
export const TRAP_ICON_URL = '/branding/conditions/trap.webp';

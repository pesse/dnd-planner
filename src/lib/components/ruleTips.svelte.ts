/** Regeltext eines Bibliothekseintrags als Tooltip-Markdown, einmal geladen und reaktiv abrufbar. */
import { getRuleByKey } from '../rulesLibrary';
import type { Badge } from '../conditionIcon';
import { ruleTipMarkdown } from './ruleRefLinks.svelte';

const tips = $state<Record<string, string>>({});
const requested = new Set<string>();

/** Liefert beim ersten Aufruf `null` und füllt sich nach, sobald die Regel geladen ist. */
export function ruleTipFor(key: string): string | null {
  if (!requested.has(key)) {
    requested.add(key);
    void getRuleByKey(key).then((r) => {
      if (r) tips[key] = ruleTipMarkdown(r);
    });
  }
  return tips[key] ?? null;
}

export const badgeRuleKey = (b: Badge): string => `srd-2024_${b}`;

export const badgeTip = (b: Badge): string | null => ruleTipFor(badgeRuleKey(b));

/** Ein Hinweis zur Bedienung über dem Regeltext, damit der eine Tooltip beides trägt. */
export function withRule(hint: string, key: string): string {
  const rule = ruleTipFor(key);
  return rule ? `${hint}\n\n---\n\n${rule}` : hint;
}
